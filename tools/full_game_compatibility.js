'use strict';

// Read-only compatibility probe for an installed IKEMEN game. It exercises the
// same parsers used by the extension without rewriting the inspected game.
const fs = require('fs');
const path = require('path');
const { parseDef, kind, sectionMap, sections, unquote } = require('../src/def_model');
const { parseSelectDef } = require('../src/select_def_model');
const { motifPreview, rosterPreview } = require('../src/select_roster_preview');
const { readSff, spritePng } = require('../src/sff_reader');
const { readSnd } = require('../src/snd_reader');
const { parseAir } = require('../src/air_preview_model');
const { stageModel, validateStage } = require('../src/stage_model');
const { screenpackModel, validateScreenpack } = require('../src/screenpack_model');
const { parseCommands, diagnosticsFor } = require('../src/command_movelist_model');
const { analyzeZss } = require('../src/analyzer');

function walk(root, output = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) {
    // A game scan must survive protected editor sockets, stale extension-host
    // profiles, cloud placeholders, and other unreadable non-game folders.
    if (['EACCES', 'EPERM', 'ENOENT'].includes(error.code)) return output;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && (
      ['save', '.git', '.ikemen-tools', 'node_modules'].includes(entry.name) ||
      /^(?:_engine_)?backup(?:_|$)/i.test(entry.name) ||
      /^\.vscode-live-/i.test(entry.name) ||
      /^\.vsix-stage-/i.test(entry.name)
    )) continue;
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) walk(filename, output); else output.push(filename);
  }
  return output;
}

function resolveAsset(root, owner, reference) {
  if (!reference) return '';
  const clean = unquote(reference).replace(/[\\/]/g, path.sep);
  const candidates = [path.resolve(path.dirname(owner), clean), path.resolve(root, clean), path.resolve(root, 'data', clean)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function finding(file, error) { return { file, error: error && error.message || String(error) }; }
function relative(root, filename) { return path.relative(root, filename).replace(/\\/g, '/'); }

function scan(gameRoot) {
  const root = path.resolve(gameRoot), files = walk(root), report = {
    schema: 1, root, generatedAt: new Date().toISOString(), files: files.length,
    roster: {}, sff: { total: 0, parsed: 0, rendered: 0, sprites: 0, versions: {}, errors: [] },
    air: { total: 0, parsed: 0, actions: 0, frames: 0, errors: [] },
    snd: { total: 0, parsed: 0, sounds: 0, issues: [], errors: [] },
    stages: { total: 0, parsed: 0, issues: [], errors: [] },
    screenpacks: { total: 0, parsed: 0, issues: [], errors: [] },
    characters: { total: 0, missingFiles: [], errors: [] },
    commands: { files: 0, commands: 0, diagnostics: [] },
    zss: { files: 0, issues: [] }
  };

  const selectFile = path.join(root, 'data', 'select.def');
  const motifCandidates = [path.join(root, 'data', 'system.def'), path.join(root, 'data', 'system.base.def')];
  const motifFile = motifCandidates.find((filename) => fs.existsSync(filename)) || motifCandidates[0];
  if (fs.existsSync(selectFile) && fs.existsSync(motifFile)) {
    try {
      const select = parseSelectDef(fs.readFileSync(selectFile, 'utf8')), motif = motifPreview(motifFile), roster = rosterPreview(selectFile, select, motif);
      report.roster = {
        entries: select.characters.length, cells: roster.cells.length, stages: select.stages.length,
        grid: motif.grid || null, motifState: motif.state,
        portraits: Object.values(roster.portraits).reduce((counts, item) => { counts[item.state] = (counts[item.state] || 0) + 1; return counts; }, {}),
        problems: roster.cells.filter((cell) => !['ready', 'special'].includes(roster.portraits[cell.id].state)).map((cell) => ({ name: cell.name, ...roster.portraits[cell.id] }))
      };
    } catch (error) { report.roster.error = error.message; }
  } else report.roster.error = 'data/select.def and a usable data/system.def or data/system.base.def are required.';

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase(), rel = relative(root, filename);
    try {
      if (ext === '.sff') {
        report.sff.total += 1; const archive = readSff(filename), version = archive.header.version.join('.');
        report.sff.parsed += 1; report.sff.sprites += archive.sprites.length; report.sff.versions[version] = (report.sff.versions[version] || 0) + 1;
        const samples = [archive.sprites.find((sprite) => sprite.group === 9000 && sprite.number === 0), archive.sprites.find((sprite) => sprite.dataSize > 0)].filter(Boolean);
        for (const sprite of new Map(samples.map((sprite) => [sprite.index, sprite])).values()) { spritePng(archive, sprite); report.sff.rendered += 1; }
      } else if (ext === '.snd') {
        report.snd.total += 1; const archive = readSnd(filename); report.snd.parsed += 1; report.snd.sounds += archive.entries.length;
        for (const issue of archive.issues) report.snd.issues.push({ file: rel, issue });
      } else if (ext === '.air') {
        report.air.total += 1; const actions = parseAir(fs.readFileSync(filename, 'utf8')); report.air.parsed += 1;
        report.air.actions += actions.length; report.air.frames += actions.reduce((sum, action) => sum + action.frames.length, 0);
      }
    } catch (error) {
      if (ext === '.sff') report.sff.errors.push(finding(rel, error));
      else if (ext === '.snd') report.snd.errors.push(finding(rel, error));
      else if (ext === '.air') report.air.errors.push(finding(rel, error));
    }
  }

  for (const filename of files.filter((item) => /\.def$/i.test(item))) {
    const rel = relative(root, filename); let document;
    try { document = parseDef(fs.readFileSync(filename, 'utf8'), filename); } catch (error) { continue; }
    const type = kind(document);
    try {
      if (type === 'stage') {
        report.stages.total += 1; const model = stageModel(document), sffPath = resolveAsset(root, filename, model.sff);
        const archive = model.sff && fs.existsSync(sffPath) ? readSff(sffPath) : null; report.stages.parsed += 1;
        for (const issue of validateStage(model, archive)) report.stages.issues.push({ file: rel, ...issue });
      } else if (type === 'screenpack') {
        report.screenpacks.total += 1; const model = screenpackModel(document), sffPath = resolveAsset(root, filename, model.sff);
        const archive = model.sff && fs.existsSync(sffPath) ? readSff(sffPath) : null; report.screenpacks.parsed += 1;
        for (const issue of validateScreenpack(model, archive)) report.screenpacks.issues.push({ file: rel, ...issue });
      }
    } catch (error) {
      (type === 'stage' ? report.stages : report.screenpacks).errors.push(finding(rel, error));
    }
    if (rel.toLowerCase().startsWith('chars/')) {
      const info = sections(document, 'Info')[0], fileSection = sections(document, 'Files')[0];
      if (!info || !fileSection) continue;
      report.characters.total += 1; const values = sectionMap(fileSection);
      for (const [key, value] of Object.entries(values)) {
        if (!/^(?:sprite|anim|sound|cmd|cns|st\d*|movelist\d*|fx\d*)$/i.test(key)) continue;
        const reference = unquote(value); if (!reference || /^[A-Za-z]+:/.test(reference)) continue;
        const target = resolveAsset(root, filename, reference);
        if (!fs.existsSync(target)) report.characters.missingFiles.push({ file: rel, key, reference });
      }
    }
  }

  for (const filename of files.filter((item) => /\.(?:cmd|zss)$/i.test(item))) {
    const text = fs.readFileSync(filename, 'utf8'), rel = relative(root, filename);
    const parsed = parseCommands(text, filename);
    if (parsed.commands.length) { report.commands.files += 1; report.commands.commands += parsed.commands.length; for (const command of parsed.commands) for (const item of diagnosticsFor(command, parsed.commands)) if (item.severity === 'error' || item.severity === 'warning') report.commands.diagnostics.push({ file: rel, command: command.name, ...item }); }
    if (/\.zss$/i.test(filename)) { report.zss.files += 1; for (const issue of analyzeZss(text, { mapPrefixes: [], functionPrefixes: [] }).issues) if (issue.severity === 'error' || issue.severity === 'warning') report.zss.issues.push({ file: rel, ...issue }); }
  }
  report.ok = !report.roster.error && !report.roster.problems?.length && !report.sff.errors.length && !report.air.errors.length && !report.snd.errors.length && !report.stages.errors.length && !report.screenpacks.errors.length;
  return report;
}

function markdown(report) {
  const rows = [
    '# IKEMEN ZSS Tools — Full Game Compatibility Scan', '', `- Root: \`${report.root}\``, `- Generated: ${report.generatedAt}`, `- Files inspected: ${report.files}`, `- Structural result: **${report.ok ? 'PASS' : 'REVIEW'}**`, '',
    '## Coverage', '',
    `- Roster: ${report.roster.cells || 0} cells; portraits ${JSON.stringify(report.roster.portraits || {})}`,
    `- SFF: ${report.sff.parsed}/${report.sff.total} parsed; ${report.sff.sprites} sprites; versions ${JSON.stringify(report.sff.versions)}; ${report.sff.rendered} representative renders`,
    `- AIR: ${report.air.parsed}/${report.air.total} parsed; ${report.air.actions} actions; ${report.air.frames} elements`,
    `- SND: ${report.snd.parsed}/${report.snd.total} parsed; ${report.snd.sounds} sounds`,
    `- Stages: ${report.stages.parsed}/${report.stages.total} parsed; ${report.stages.issues.length} validation findings`,
    `- Screenpacks: ${report.screenpacks.parsed}/${report.screenpacks.total} parsed; ${report.screenpacks.issues.length} validation findings`,
    `- Character DEF files: ${report.characters.total}; ${report.characters.missingFiles.length} missing references`,
    `- Commands: ${report.commands.commands} across ${report.commands.files} files; ${report.commands.diagnostics.length} warnings/errors`,
    `- ZSS: ${report.zss.files} files; ${report.zss.issues.length} warnings/errors`, ''
  ];
  for (const [title, items] of [['Roster problems', report.roster.problems || []], ['SFF errors', report.sff.errors], ['AIR errors', report.air.errors], ['SND errors', report.snd.errors], ['Stage parser errors', report.stages.errors], ['Screenpack parser errors', report.screenpacks.errors], ['Missing character files', report.characters.missingFiles]]) {
    rows.push(`## ${title}`, '', ...(items.length ? items.map((item) => `- \`${item.file || item.name}\`: ${item.error || item.detail || `${item.key} = ${item.reference}`}`) : ['- None']), '');
  }
  rows.push('## Interpretation', '', '- Parser success means the extension can structurally open the asset. It does not claim the game content itself is authored correctly.', '- Validation findings are retained in the JSON report for review and are not silently treated as extension failures.', '');
  return rows.join('\n');
}

if (require.main === module) {
  const root = process.argv[2], output = process.argv[3];
  if (!root || !fs.existsSync(root)) { console.error('Usage: node tools/full_game_compatibility.js <game-root> [output-base]'); process.exit(2); }
  const report = scan(root); console.log(JSON.stringify(report, null, 2));
  if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(`${output}.md`, markdown(report)); }
  if (!report.ok) process.exitCode = 1;
}

module.exports = { scan, markdown, resolveAsset };
