'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const controllerCatalog = require('../data/sctrl.json');
const { buildCharacterDependencyModel } = require('./character_dependency_model');
const { analyzeZss } = require('./analyzer');

const CODE_EXTENSIONS = new Set(['.cns', '.inp', '.cmd', '.jnp', '.zss']);
const UNIVERSAL_CONTROLLER_KEYS = new Set(['type', 'persistent', 'ignorehitpause']);
const COMMAND_KEYS = new Set(['name', 'command', 'time', 'buffer.time']);
const COMMAND_DEFAULT_KEYS = new Set(['command.time', 'command.buffer.time']);
const LEGACY_COMPAT_KEYS = Object.freeze({
  explod: ['velocity'], playsnd: ['volume'], changeanim2: ['value'], selfstate: ['value'],
  posfreeze: ['x', 'y'], nothitby: ['value2'], null: ['*']
});

function digest(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function eolFor(text) { return String(text).includes('\r\n') ? '\r\n' : '\n'; }
function stripComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== '\\') quote = !quote;
    if (!quote && (line[i] === ';' || line[i] === '#')) return line.slice(0, i);
  }
  return line;
}
function canonical(value) { return String(value || '').trim().toLowerCase(); }
function sectionHeader(line) { const match = /^\s*\[\s*([^\]]+)\]\s*(?:[;#].*)?$/.exec(line); return match ? match[1].trim() : ''; }
function assignment(line) {
  const clean = stripComment(line), match = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(clean);
  return match ? { key: match[1], normalized: canonical(match[1]), value: match[2].trim(), column: line.indexOf(match[1]) } : null;
}
function isTrigger(key) { return /^trigger(?:all|\d+)$/i.test(key); }
function levelRank(level) { return ({ error: 0, warning: 1, convention: 2, suggestion: 3 })[level] ?? 2; }
function finding(input) {
  const item = { endLine: input.line, safe: false, ...input };
  item.id = digest([item.code, item.file, item.line, item.endLine, item.message].join('\0')).slice(0, 20);
  return item;
}

function levenshtein(left, right) {
  left = canonical(left); right = canonical(right);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)); diagonal = old;
    }
  }
  return row[right.length];
}
function nearestKey(key, allowed) {
  const candidates = [...allowed].map((name) => ({ name, distance: levenshtein(key, name) })).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
  const best = candidates[0]; return best && best.distance <= Math.max(2, Math.floor(String(key).length / 4)) ? best.name : '';
}
function controllerIndex(catalog = controllerCatalog) {
  const index = new Map();
  for (const controller of catalog) {
    const controllerName = canonical(controller.name);
    index.set(controllerName, {
    controller,
    keys: new Set([...(controller.params || []).map((item) => canonical(item.name)), ...(LEGACY_COMPAT_KEYS[controllerName] || []), ...UNIVERSAL_CONTROLLER_KEYS])
    });
  }
  const hitDef = index.get('hitdef'), reversal = index.get('reversaldef');
  if (hitDef && reversal) for (const key of hitDef.keys) reversal.keys.add(key);
  return index;
}

function sectionsOf(text) {
  const lines = String(text).split(/\r?\n/), sections = [];
  let current = null;
  for (let line = 0; line < lines.length; line += 1) {
    const header = sectionHeader(lines[line]);
    if (!header) continue;
    if (current) current.endLine = line - 1;
    current = { header, line, endLine: lines.length - 1, entries: [] }; sections.push(current);
  }
  for (const section of sections) {
    for (let line = section.line + 1; line <= section.endLine; line += 1) {
      const entry = assignment(lines[line]); if (entry) section.entries.push({ ...entry, line, raw: lines[line] });
    }
  }
  return { lines, sections };
}

function duplicateFindings(section, filename) {
  const groups = new Map(), output = [];
  for (const entry of section.entries) {
    if (isTrigger(entry.key)) continue;
    if (!groups.has(entry.normalized)) groups.set(entry.normalized, []);
    groups.get(entry.normalized).push(entry);
  }
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    const first = entries[0];
    for (const later of entries.slice(1)) {
      const exact = canonical(first.value) === canonical(later.value);
      output.push(finding({
        file: filename, line: later.line, code: exact ? 'exact-duplicate-parameter' : 'shadowed-parameter',
        level: exact ? 'convention' : 'warning', category: 'Duplicate parameters', key: later.key,
        title: exact ? `Exact duplicate ${later.key}` : `${later.key} is shadowed`,
        message: exact
          ? `${later.key} repeats the same value from line ${first.line + 1}.`
          : `${later.key} is already defined on line ${first.line + 1}. The effective value is “${first.value}”; editing this later value may appear to do nothing.`,
        effectiveValue: first.value, safe: true,
        fix: { kind: 'remove-lines', startLine: later.line, endLine: later.line, reason: exact ? 'exact duplicate parameter' : 'shadowed parameter' }
      }));
    }
  }
  return output;
}
function suggestedKeyFix(entry, suggestion, reason) {
  if (!suggestion) return { kind: 'remove-lines', startLine: entry.line, endLine: entry.line, reason };
  return { kind: 'replace-line', startLine: entry.line, endLine: entry.line,
    replacement: `${entry.raw.slice(0, entry.column)}${suggestion}${entry.raw.slice(entry.column + entry.key.length)}`, reason: `correct ${reason}` };
}

function analyzeLegacyCode(text, filename, options = {}) {
  const parsed = sectionsOf(text), controllers = controllerIndex(options.catalog), output = [];
  const allowedExtra = new Set((options.allowedParameters || []).map(canonical));
  let stateNumber = '';
  for (const section of parsed.sections) {
    const stateDef = /^statedef\s+(-?\d+)\b/i.exec(section.header);
    if (stateDef) { stateNumber = stateDef[1]; continue; }
    if (/^command\s*$/i.test(section.header)) {
      output.push(...duplicateFindings(section, filename));
      if (options.checkUnknownParameters !== false) for (const entry of section.entries) if (!COMMAND_KEYS.has(entry.normalized)) {
        const suggestion = nearestKey(entry.normalized, COMMAND_KEYS);
        output.push(finding({ file: filename, line: entry.line, code: 'unknown-command-parameter', level: 'warning', category: 'Unknown parameters', key: entry.key,
          title: `Unknown Command parameter ${entry.key}`, message: `A [Command] block does not document “${entry.key}”.${suggestion ? ` Did you mean “${suggestion}”?` : ''}`, suggestion,
          fix: suggestedKeyFix(entry, suggestion, 'unknown command parameter') }));
      }
      continue;
    }
    if (/^defaults\s*$/i.test(section.header)) {
      output.push(...duplicateFindings(section, filename));
      if (options.checkUnknownParameters !== false) for (const entry of section.entries) if (!COMMAND_DEFAULT_KEYS.has(entry.normalized)) {
        const suggestion = nearestKey(entry.normalized, COMMAND_DEFAULT_KEYS);
        output.push(finding({ file: filename, line: entry.line, code: 'unknown-command-default', level: 'warning', category: 'Unknown parameters', key: entry.key,
          title: `Unknown command default ${entry.key}`, message: `[Defaults] does not document “${entry.key}”.${suggestion ? ` Did you mean “${suggestion}”?` : ''}`, suggestion,
          fix: suggestedKeyFix(entry, suggestion, 'unknown command default') }));
      }
      continue;
    }
    const state = /^state\s+([^,]+)(.*)$/i.exec(section.header);
    if (!state) continue;
    output.push(...duplicateFindings(section, filename));
    const statedLabel = state[1].trim();
    if (stateNumber && statedLabel !== stateNumber) {
      const replacement = parsed.lines[section.line].replace(/^(\s*\[\s*State\s+)[^,\]]+/i, `$1${stateNumber}`);
      output.push(finding({ file: filename, line: section.line, code: 'state-header-mismatch', level: 'convention', category: 'State headers',
        title: `State header does not match StateDef ${stateNumber}`, message: `This header begins with “${statedLabel}” while its owning StateDef is ${stateNumber}. The label is cosmetic, but mismatches make navigation and review harder.`,
        safe: true, fix: { kind: 'replace-line', startLine: section.line, endLine: section.line, replacement, reason: 'normalize state header' } }));
    }
    const typeEntry = section.entries.find((entry) => entry.normalized === 'type');
    const indexed = typeEntry && controllers.get(canonical(typeEntry.value));
    if (!indexed || options.checkUnknownParameters === false) continue;
    const allowed = new Set([...indexed.keys, ...allowedExtra]);
    if (allowed.has('*')) continue;
    for (const entry of section.entries) {
      if (isTrigger(entry.key) || allowed.has(entry.normalized)) continue;
      const suggestion = nearestKey(entry.normalized, allowed);
      output.push(finding({ file: filename, line: entry.line, code: 'unknown-controller-parameter', level: 'warning', category: 'Unknown parameters', key: entry.key, controller: indexed.controller.name,
        title: `Unknown ${indexed.controller.name} parameter ${entry.key}`,
        message: `${indexed.controller.name} does not document “${entry.key}” in the selected IKEMEN profile.${suggestion ? ` Did you mean “${suggestion}”?` : ' Keep it if this is an intentional project extension.'}`,
        suggestion, docs: indexed.controller.url || '', fix: suggestedKeyFix(entry, suggestion, 'unknown controller parameter') }));
    }
  }
  for (let line = 0; line < parsed.lines.length; line += 1) {
    const clean = stripComment(parsed.lines[line]).trim(); if (!clean) continue;
    if ((clean.startsWith('[') && !sectionHeader(parsed.lines[line])) || (/^[A-Za-z_][A-Za-z0-9_.]*\s*:/.test(clean) && !/=/.test(clean))) {
      output.push(finding({ file: filename, line, code: 'malformed-line', level: 'warning', category: 'Malformed lines', title: 'Line could not be parsed safely',
        message: 'This resembles a section header or assignment but does not use valid legacy syntax. Review it before commenting or removing it.',
        fix: { kind: 'remove-lines', startLine: line, endLine: line, reason: 'malformed line' } }));
    }
  }
  return output;
}

function actionBlocks(text) {
  const lines = String(text).split(/\r?\n/), actions = [];
  for (let line = 0; line < lines.length; line += 1) {
    const match = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]\s*(?:;.*)?$/i.exec(lines[line]);
    if (!match) continue;
    if (actions.length) actions[actions.length - 1].endLine = line - 1;
    actions.push({ number: Number(match[1]), line, endLine: lines.length - 1 });
  }
  return { lines, actions };
}
function canonicalAction(lines, action) { return lines.slice(action.line + 1, action.endLine + 1).map(stripComment).map((line) => line.trim()).filter(Boolean).join('\n').toLowerCase(); }
function hasSpriteElement(lines, action) { return lines.slice(action.line + 1, action.endLine + 1).some((line) => /^\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/.test(stripComment(line))); }
function analyzeAir(text, filename) {
  const parsed = actionBlocks(text), output = [], seen = new Map();
  for (const action of parsed.actions) {
    const canonicalBody = canonicalAction(parsed.lines, action), previous = seen.get(action.number);
    if (previous) {
      const exact = canonicalAction(parsed.lines, previous) === canonicalBody;
      output.push(finding({ file: filename, line: action.line, endLine: action.endLine, code: exact ? 'exact-duplicate-action' : 'duplicate-action',
        level: exact ? 'convention' : 'warning', category: 'Duplicate AIR actions', title: `Action ${action.number} is defined more than once`,
        message: exact ? `This is an exact duplicate of Action ${action.number} at line ${previous.line + 1}.` : `IKEMEN resolves Action ${action.number} from an earlier block at line ${previous.line + 1}. Compare both animations before removing either block.`,
        safe: exact, action: action.number, compareLine: previous.line,
        fix: { kind: 'remove-lines', startLine: action.line, endLine: action.endLine, reason: 'duplicate AIR action' } }));
    } else seen.set(action.number, action);
    if (!hasSpriteElement(parsed.lines, action)) output.push(finding({ file: filename, line: action.line, endLine: action.endLine, code: 'empty-action', level: 'suggestion', category: 'Empty AIR actions', action: action.number,
      title: `Action ${action.number} has no sprite elements`, message: 'This may intentionally create an invisible animation or preserve a legacy reference. Review its runtime use and do not invent replacement frames automatically.' }));
    for (let line = action.line + 1; line <= action.endLine; line += 1) {
      const clean = stripComment(parsed.lines[line]).trim(); if (!/^[-+]?\d+\s*,/.test(clean)) continue;
      if (clean.split(',').length < 5) output.push(finding({ file: filename, line, code: 'malformed-air-element', level: 'error', category: 'Malformed lines', action: action.number,
        title: `Malformed sprite element in Action ${action.number}`, message: 'AIR sprite elements require at least group, index, X offset, Y offset, and time.',
        fix: { kind: 'remove-lines', startLine: line, endLine: line, reason: 'malformed AIR element' } }));
    }
  }
  return output;
}

function analyzeZssFile(text, filename, options = {}) {
  return analyzeZss(text, options).issues.map((issue) => finding({ file: filename, line: issue.line, code: `zss-${issue.code}`, level: issue.severity === 'information' ? 'convention' : issue.severity, category: 'ZSS safety',
    title: issue.message, message: issue.help || issue.message }));
}

function analyzeHealthFile(filename, text, options = {}) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.air') return analyzeAir(text, filename, options);
  if (extension === '.zss') return analyzeZssFile(text, filename, options.analyzerOptions || {});
  if (['.cns', '.inp', '.cmd', '.jnp'].includes(extension)) return analyzeLegacyCode(text, filename, options);
  return [];
}
function recount(model) {
  model.findings.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.file.localeCompare(b.file) || a.line - b.line);
  model.counts = { error: 0, warning: 0, convention: 0, suggestion: 0, fixable: 0, safe: 0 };
  for (const item of model.findings) { model.counts[item.level] = (model.counts[item.level] || 0) + 1; if (item.fix) model.counts.fixable += 1; if (item.fix && item.safe) model.counts.safe += 1; }
  return model;
}
function addHealthFiles(model, filenames, options = {}, io = fs) {
  const existing = new Set(model.files.map((file) => path.resolve(file.filename).toLowerCase())), base = path.dirname(model.defPath);
  for (const input of filenames || []) {
    const filename = path.resolve(input), extension = path.extname(filename).toLowerCase();
    if (existing.has(filename.toLowerCase()) || (!CODE_EXTENSIONS.has(extension) && extension !== '.air') || !io.existsSync(filename)) continue;
    let text; try { text = io.readFileSync(filename, 'utf8'); } catch (_) { continue; }
    const fileFindings = analyzeHealthFile(filename, text, options);
    model.files.push({ filename, relative: path.relative(base, filename) || path.basename(filename), extension, text, hash: digest(text), findings: fileFindings.length, extra: true });
    model.findings.push(...fileFindings); existing.add(filename.toLowerCase());
  }
  return recount(model);
}

function buildCharacterHealthModel(defPath, options = {}, io = fs) {
  const dependency = buildCharacterDependencyModel(defPath, io), files = [], findings = [];
  for (const node of dependency.nodes) {
    if (!node.exists) {
      const engineResolvedCommon = dependency.edges.some((edge) => edge.to === node.id && /\]\s+stcommon\b/i.test(edge.label || ''));
      if (engineResolvedCommon) continue;
      findings.push(finding({ file: node.filename, line: 0, code: 'missing-dependency', level: 'error', category: 'Missing dependencies', title: `Missing ${node.kind}: ${node.label}`, message: `The character dependency tree references ${node.relative}, but the file does not exist.` }));
      continue;
    }
    const extension = path.extname(node.filename).toLowerCase(); if (!CODE_EXTENSIONS.has(extension) && extension !== '.air') continue;
    let text; try { text = io.readFileSync(node.filename, 'utf8'); } catch (_) { continue; }
    const fileFindings = analyzeHealthFile(node.filename, text, options);
    files.push({ filename: node.filename, relative: node.relative, extension, text, hash: digest(text), findings: fileFindings.length }); findings.push(...fileFindings);
  }
  return recount({ version: 1, profile: options.profile || 'ikemen-1.0', profileLabel: options.profileLabel || 'IKEMEN GO 1.0', defPath: path.resolve(defPath), character: dependency.character, dependency, files, findings, counts: {} });
}

function commentLines(lines, start, end, reason) {
  const prefix = `; IKEMaker cleanup review (${reason}): `;
  return lines.slice(start, end + 1).map((line) => line.trim() ? `${prefix}${line}` : ';').join('\n');
}
function createRepairPlan(model, selectedIds, mode = 'comment') {
  const selected = new Set(selectedIds || []), byFile = new Map(), skipped = [];
  for (const item of model.findings) if (selected.has(item.id) && item.fix) {
    if (!byFile.has(item.file)) byFile.set(item.file, []); byFile.get(item.file).push({ item, ...item.fix });
  }
  const writes = [];
  for (const [filename, edits] of byFile) {
    const file = model.files.find((entry) => path.resolve(entry.filename) === path.resolve(filename)); if (!file) continue;
    const lines = file.text.split(/\r?\n/), accepted = [];
    for (const edit of edits.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine)) {
      if (accepted.some((current) => edit.startLine <= current.endLine && edit.endLine >= current.startLine)) { skipped.push({ id: edit.item.id, reason: 'overlaps another selected repair' }); continue; }
      accepted.push(edit);
    }
    for (const edit of accepted.sort((a, b) => b.startLine - a.startLine)) {
      const replacement = edit.kind === 'replace-line' ? [edit.replacement]
        : mode === 'delete' ? [] : commentLines(lines, edit.startLine, edit.endLine, edit.reason).split('\n');
      lines.splice(edit.startLine, edit.endLine - edit.startLine + 1, ...replacement);
    }
    const after = lines.join(eolFor(file.text)); if (after !== file.text) writes.push({ filename, before: file.text, after, expectedHash: file.hash, repairs: accepted.map((edit) => edit.item.id) });
  }
  return { mode, writes, skipped, repairCount: writes.reduce((sum, item) => sum + item.repairs.length, 0) };
}

module.exports = {
  CODE_EXTENSIONS, LEGACY_COMPAT_KEYS, stripComment, assignment, sectionsOf, levenshtein, nearestKey, controllerIndex,
  analyzeLegacyCode, actionBlocks, analyzeAir, analyzeZssFile, analyzeHealthFile, addHealthFiles, recount, buildCharacterHealthModel, createRepairPlan
};
