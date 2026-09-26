'use strict';

const path = require('path');
const { parseDef, sections, unquote } = require('./def_model');
const { zssControllerName } = require('./sctrl');

function splitComment(raw) {
  let quoted = false;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '"' && raw[i - 1] !== '\\') quoted = !quoted;
    if (raw[i] === ';' && !quoted) return { code: raw.slice(0, i), comment: raw.slice(i + 1).trim() };
  }
  return { code: raw, comment: '' };
}

function normalizeKey(value) { return String(value || '').trim().toLowerCase(); }
function canonicalStateKey(value) {
  return ({ movetype: 'moveType', poweradd: 'powerAdd', velset: 'velSet', facep2: 'faceP2', hitdefpersist: 'hitDefPersist', movehitpersist: 'moveHitPersist', hitcountpersist: 'hitCountPersist', sprpriority: 'sprPriority' })[normalizeKey(value)] || String(value || '').trim();
}

function parseEntries(lines, start, end, findings) {
  const entries = [], comments = [];
  let current = null;
  for (let line = start; line <= end; line += 1) {
    const part = splitComment(lines[line] || ''), code = part.code.trim();
    if (part.comment) comments.push({ line, text: part.comment });
    if (!code) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_.]*(?:\(\s*[^)]*\s*\))?)\s*=\s*(.*)$/.exec(code);
    if (match) {
      current = { key: match[1], normalized: normalizeKey(match[1]), value: match[2].trim(), line, comments: part.comment ? [part.comment] : [] };
      entries.push(current);
    } else if (current) {
      current.value = `${current.value} ${code}`.trim();
      findings.push({ level: 'review', line, code: 'continued-expression', message: 'A continuation line was joined to the preceding value. Review the resulting expression.' });
    } else {
      findings.push({ level: 'unsupported', line, code: 'unparsed-line', message: `This line was not recognized: ${code}` });
    }
  }
  return { entries, comments };
}

function parseCnsSections(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/), sections = [];
  for (let line = 0; line < lines.length; line += 1) {
    const header = /^\s*\[\s*([^\]]+)\s*\]/.exec(splitComment(lines[line]).code);
    if (header) sections.push({ header: header[1].trim(), line, endLine: lines.length - 1 });
  }
  for (let i = 0; i < sections.length - 1; i += 1) sections[i].endLine = sections[i + 1].line - 1;
  return { lines, sections };
}

function conditionFor(entries) {
  const all = entries.filter((item) => item.normalized === 'triggerall').map((item) => item.value).filter(Boolean);
  const groups = new Map();
  for (const item of entries) {
    const match = /^trigger(\d+)$/.exec(item.normalized); if (!match || !item.value) continue;
    const number = Number(match[1]); if (!groups.has(number)) groups.set(number, []); groups.get(number).push(item.value);
  }
  const and = (values) => values.length === 1 ? values[0] : values.map((value) => `(${value})`).join(' && ');
  const alternatives = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, values]) => and(values));
  const groupCondition = alternatives.length === 0 ? '' : alternatives.length === 1 ? alternatives[0] : alternatives.map((value) => `(${value})`).join(' || ');
  return [...all, groupCondition].filter(Boolean).map((value) => `(${value})`).join(' && ') || '';
}

function catalogIndex(catalog) {
  const controllers = new Map();
  const legacy = { explod: ['velocity'], playsnd: ['volume'], changeanim2: ['value'], selfstate: ['value'], posfreeze: ['x', 'y'], nothitby: ['value2'], null: ['*'] };
  for (const controller of catalog || []) {
    const name = normalizeKey(controller.name), keys = new Set([...(controller.params || []).map((item) => normalizeKey(item.name)), ...(legacy[name] || [])]);
    controllers.set(name, { ...controller, conversionKeys: keys });
  }
  const hitDef = controllers.get('hitdef'), reversal = controllers.get('reversaldef');
  if (hitDef && reversal) for (const key of hitDef.conversionKeys) reversal.conversionKeys.add(key);
  return controllers;
}

function convertController(section, parsed, catalog, findings) {
  const { entries, comments } = parseEntries(parsed.lines, section.line + 1, section.endLine, findings);
  const type = entries.find((item) => item.normalized === 'type');
  if (!type?.value) {
    findings.push({ level: 'unsupported', line: section.line, code: 'missing-controller-type', message: `${section.header} has no controller type.` });
    return '';
  }
  const typeName = type.value.trim(), known = catalog.get(normalizeKey(typeName));
  if (!known) findings.push({ level: 'review', line: type.line, code: 'unknown-controller', message: `Controller ${typeName} is not in the bundled IKEMEN 1.0 catalog.` });
  const knownParams = known?.conversionKeys || new Set();
  const rawParams = entries.filter((item) => !/^(?:type|triggerall|trigger\d+|persistent|ignorehitpause)$/.test(item.normalized));
  for (const item of entries) {
    if (/^trigger/i.test(item.key) && !/^(?:triggerall|trigger\d+)$/i.test(item.key)) findings.push({ level: 'unsupported', line: item.line, code: 'malformed-trigger-name', message: `${item.key} is not a valid triggerall or numbered trigger key.` });
    if (/^(?:triggerall|trigger\d+)$/i.test(item.key) && !item.value) findings.push({ level: 'unsupported', line: item.line, code: 'empty-trigger', message: `${item.key} has no expression and cannot be translated safely.` });
  }
  const params = [];
  for (const item of rawParams) {
    const shorthand = /^(f?var)\(\s*(.+?)\s*\)$/i.exec(item.key);
    if (shorthand && /^(?:varset|varadd|parentvarset|parentvaradd)$/i.test(typeName)) {
      params.push({ ...item, key: shorthand[1].toLowerCase() === 'fvar' ? 'fv' : 'v', normalized: shorthand[1].toLowerCase() === 'fvar' ? 'fv' : 'v', value: shorthand[2] });
      params.push({ ...item, key: 'value', normalized: 'value' });
    } else params.push(item);
  }
  for (const item of params) if (!String(item.value || '').trim()) findings.push({ level: 'unsupported', line: item.line, code: 'empty-parameter', message: `${typeName}.${item.key} has no value and cannot be translated safely.` });
  const seenParams = new Set();
  for (const item of params) {
    if (seenParams.has(item.normalized)) findings.push({ level: 'review', line: item.line, code: 'duplicate-parameter', message: `${typeName}.${item.key} occurs more than once; confirm the intended CNS compatibility behavior.` });
    seenParams.add(item.normalized);
  }
  if (known && !knownParams.has('*')) for (const item of params) if (!knownParams.has(item.normalized)) findings.push({ level: 'review', line: item.line, code: 'unknown-parameter', message: `${typeName}.${item.key} is not documented by the bundled IKEMEN 1.0 catalog.` });
  const persistent = entries.find((item) => item.normalized === 'persistent')?.value;
  const ignore = entries.find((item) => item.normalized === 'ignorehitpause')?.value;
  if (ignore && !/^(?:0|1)$/.test(ignore)) findings.push({ level: 'review', line: section.line, code: 'dynamic-ignorehitpause', message: 'Dynamic ignorehitpause requires manual timing review.' });
  if (ignore && ignore !== '0' && params.some((item) => item.normalized === 'redirectid')) findings.push({ level: 'review', line: section.line, code: 'redirected-ignorehitpause', message: 'A redirected controller with ignorehitpause has known CNS/ZSS behavioral differences. Test this controller in IKEMEN before replacing the CNS source.' });
  const usesIgnore = Boolean(ignore && ignore !== '0'), usesPersistent = persistent !== undefined && persistent !== '';
  const condition = conditionFor(entries), controllerName = known ? zssControllerName(known.name) : zssControllerName(typeName);
  const output = [`# [${section.header}]`];
  for (const comment of comments) output.push(`# ${comment.text}`);
  let body = [`${controllerName}{`, ...params.map((item) => `\t${item.key}: ${item.value};`), '}'];
  const wrap = (head, lines) => [`${head} {`, ...lines.map((line) => `\t${line}`), '}'];
  if (usesPersistent) body = wrap(`persistent(${persistent}) if ${condition || '1'}`, body);
  else if (condition) body = wrap(`if ${condition}`, body);
  if (usesIgnore) body = wrap(usesPersistent ? 'ignoreHitPause' : `ignoreHitPause if ${condition || '1'}`, usesPersistent ? body : [`${controllerName}{`, ...params.map((item) => `\t${item.key}: ${item.value};`), '}']);
  output.push(...body);
  return output.join('\n');
}

function convertCnsToZss(text, options = {}) {
  const parsed = parseCnsSections(text), findings = [], output = [], catalog = catalogIndex(options.catalog || []);
  let stateCount = 0, controllerCount = 0, currentState = false;
  const firstSection = parsed.sections[0]?.line ?? parsed.lines.length;
  for (let line = 0; line < firstSection; line += 1) {
    const part = splitComment(parsed.lines[line]); if (part.comment) output.push(`# ${part.comment}`); else if (part.code.trim()) findings.push({ level: 'review', line, code: 'preamble-code', message: 'Code before the first section was not converted.' });
  }
  for (const section of parsed.sections) {
    const state = /^statedef\s+(.+)$/i.exec(section.header);
    if (state) {
      const { entries, comments } = parseEntries(parsed.lines, section.line + 1, section.endLine, findings);
      const seen = new Set();
      for (const item of entries) {
        if (seen.has(item.normalized)) findings.push({ level: 'review', line: item.line, code: 'duplicate-statedef-parameter', message: `StateDef parameter ${item.key} occurs more than once.` });
        seen.add(item.normalized);
      }
      const headerValues = entries.map((item) => `${canonicalStateKey(item.key)}: ${item.value};`).join(' ');
      if (output.length && output[output.length - 1] !== '') output.push('');
      for (const comment of comments) output.push(`# ${comment.text}`);
      output.push(`[StateDef ${state[1].trim()}${headerValues ? `; ${headerValues}` : ''}]`);
      currentState = true; stateCount += 1; continue;
    }
    if (/^state(?:\s|$)/i.test(section.header)) {
      if (!currentState) findings.push({ level: 'review', line: section.line, code: 'controller-without-statedef', message: `${section.header} appears before a StateDef.` });
      const converted = convertController(section, parsed, catalog, findings);
      if (converted) { output.push('', converted); controllerCount += 1; }
      continue;
    }
    const { entries } = parseEntries(parsed.lines, section.line + 1, section.endLine, findings);
    if (entries.length || section.header) findings.push({ level: 'review', line: section.line, code: 'omitted-non-state-section', message: `[${section.header}] is not ZSS state code and was omitted. Keep the original CNS assigned as the character constants file when this section is still needed.` });
  }
  if (!stateCount) findings.push({ level: 'unsupported', line: 0, code: 'no-statedef', message: 'No StateDef was found. This does not appear to be a convertible state file.' });
  const counts = { safe: stateCount + controllerCount, review: findings.filter((item) => item.level === 'review').length, unsupported: findings.filter((item) => item.level === 'unsupported').length };
  return { text: `${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, findings, counts, stateCount, controllerCount, canWrite: stateCount > 0 && counts.unsupported === 0 };
}

function stateAssignments(defText, defPath) {
  const document = parseDef(defText, defPath), files = sections(document, 'files')[0];
  if (!files) return [];
  return (files.entries || []).filter((item) => /^st\d*$/i.test(item.key)).map((item) => ({ ...item, source: path.resolve(path.dirname(defPath), unquote(item.value)) }));
}

function convertedFilename(source) { return source.replace(/\.[^.\\/]+$/, '') + '.zss'; }

function characterConversionPlan(defText, defPath, readText, catalog = []) {
  const files = [], findings = [], bySource = new Map();
  for (const assignment of stateAssignments(defText, defPath)) {
    if (/\.zss$/i.test(assignment.source)) continue;
    if (!/\.cns$/i.test(assignment.source)) { findings.push({ level: 'review', line: assignment.line, code: 'non-cns-state-file', message: `${assignment.key} points to ${path.basename(assignment.source)}; only CNS state files are converted automatically.` }); continue; }
    const key = assignment.source.toLowerCase();
    if (bySource.has(key)) { bySource.get(key).assignments.push(assignment); continue; }
    let sourceText;
    try { sourceText = readText(assignment.source); } catch (_) { findings.push({ level: 'unsupported', line: assignment.line, code: 'missing-state-file', message: `${assignment.source} could not be read.` }); continue; }
    const conversion = convertCnsToZss(sourceText, { catalog });
    const file = { assignment, assignments: [assignment], source: assignment.source, target: convertedFilename(assignment.source), sourceText, ...conversion };
    files.push(file); bySource.set(key, file);
  }
  return { defPath, defText, files, findings, canWrite: files.length > 0 && findings.every((item) => item.level !== 'unsupported') && files.every((item) => item.canWrite) };
}

function updateDefStateReferences(defText, files) {
  const eol = defText.includes('\r\n') ? '\r\n' : '\n', lines = defText.split(/\r?\n/);
  for (const file of files) {
    for (const assignment of file.assignments || [file.assignment]) {
      const line = assignment.line, raw = lines[line], part = splitComment(raw), equals = part.code.indexOf('=');
      if (equals < 0) continue;
      const originalFolder = path.dirname(unquote(assignment.value)).replace(/\\/g, '/');
      const filename = path.basename(file.target), nextValue = originalFolder === '.' ? filename : `${originalFolder}/${filename}`;
      const quoted = /^\s*"/.test(assignment.value), rendered = quoted ? `"${nextValue}"` : nextValue;
      lines[line] = `${part.code.slice(0, equals + 1)} ${rendered}${part.comment ? ` ; ${part.comment}` : ''}`;
    }
  }
  return lines.join(eol);
}

module.exports = { splitComment, parseCnsSections, conditionFor, convertCnsToZss, stateAssignments, convertedFilename, characterConversionPlan, updateDefStateReferences };
