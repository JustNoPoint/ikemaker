'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeZss, analyzeCommandReferences } = require('../src/analyzer');
const { resolveCommandCatalog, commandReferenceAtPosition } = require('../src/command_reference_model');
const { explanationFor } = require('../src/diagnostic_explanations');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-command-refs-'));
try {
  const character = path.join(root, 'chars', 'Ryu'), codeFolder = path.join(character, 'states');
  fs.mkdirSync(codeFolder, { recursive: true });
  const def = path.join(character, 'Ryu.def'), command = path.join(character, 'Ryu.cmd'), code = path.join(codeFolder, 'specials.zss');
  fs.writeFileSync(def, '[Files]\ncmd = Ryu.cmd\nstates = states/specials.zss\n');
  fs.writeFileSync(path.join(character, 'Unrelated.def'), '[Files]\ncmd = missing-variant.cmd\nstates = other.zss\n');
  fs.writeFileSync(command, '[Command]\nname = "x"\ncommand = x\n\n; Authored quarter-circle punch.\n[Command]\nname = "fireball"\ncommand = D, DF, F, x\n');
  fs.writeFileSync(code, 'if command = "fireball" {}\n');

  const catalog = resolveCommandCatalog(code);
  assert.strictEqual(catalog.resolved, true);
  assert.strictEqual(catalog.complete, true, 'a direct code assignment wins over unrelated DEF variants in the same folder');
  assert.deepStrictEqual(catalog.names.sort(), ['fireball', 'x'], 'nested character code resolves the nearest character command catalog');
  assert.deepStrictEqual(catalog.definitions.map(item => [item.name, path.basename(item.file), item.line, item.command]), [['x', 'Ryu.cmd', 1, 'x'], ['fireball', 'Ryu.cmd', 6, 'D, DF, F, x']], 'the resolved catalog retains exact definition destinations for non-writing navigation');
  assert.strictEqual(catalog.definitions[1].documentation,'Authored quarter-circle punch.','native command hover authority retains authored block documentation');
  assert.deepStrictEqual(commandReferenceAtPosition('if command = "fireball" {}', 16), { name: 'fireball', start: 14, end: 22, trigger: 'command', redirected: false });
  assert.deepStrictEqual(commandReferenceAtPosition('if command != "fireball" {}', 17), { name: 'fireball', start: 15, end: 23, trigger: 'command', redirected: false }, 'inequality references support the same exact navigation and assistance');
  assert.deepStrictEqual(commandReferenceAtPosition('if SelfCommand = "fireball" {}', 20), { name: 'fireball', start: 18, end: 26, trigger: 'selfcommand', redirected: false }, 'SelfCommand retains its distinct self-owned trigger identity');
  assert.deepStrictEqual(commandReferenceAtPosition('if enemynear, command = "fireball" {}', 29), { name: 'fireball', start: 25, end: 33, trigger: 'command', redirected: true }, 'bare redirected Command ownership remains explicit');
  assert.strictEqual(commandReferenceAtPosition('; command = "fireball"', 15, { semicolonComments: true }), null, 'classic comments do not expose navigable references');
  assert.strictEqual(commandReferenceAtPosition('let note = "command = \\"fireball\\"";', 25), null, 'command-looking text nested in another string is not a reference');

  const source = [
    'if command = "fireball" {}',
    'if command = "missing_super" || player(1), command = "x" {}',
    '# if command = "comment_only" {}',
    'let note = "command = missing_text";',
    'if command = variable {}',
    'if command = "Fireball" {}',
    'if command != "missing_negative_check" {}'
  ].join('\n');
  const missing = analyzeZss(source, { commandNames: catalog.names }).issues.filter(issue => issue.code === 'missing-command');
  assert.deepStrictEqual(missing.map(issue => [issue.line, source.split('\n')[issue.line].slice(issue.start, issue.start + issue.length)]), [[1, 'missing_super'], [5, 'Fireball'], [6, 'missing_negative_check']], 'literal unresolved equality and inequality references are reported; valid, redirected, commented, string-content, and dynamic expressions are preserved');
  assert(missing[1].message.includes('Differently cased definition: "fireball"'), 'an exact case mismatch points to the evidenced definition without rewriting the reference');
  assert(missing.every(issue => issue.severity === 'error'), 'missing character commands are critical error diagnostics');
  assert(missing.every(issue => issue.message.startsWith('CRITICAL:')), 'missing command messages visibly identify the load/runtime risk as critical');
  const cnsMissing = analyzeCommandReferences('trigger1 = command = "missing_cns"\n; trigger1 = command = "commented_cns"\ntrigger2 = command = "x"', catalog.names, { semicolonComments: true });
  assert.deepStrictEqual(cnsMissing.map(issue => [issue.line, issue.code]), [[0, 'missing-command']], 'classic CNS receives the same literal check while semicolon comments and valid names remain untouched');
  assert(explanationFor('missing-command'), 'critical missing-command diagnostics have a bundled non-writing explanation');
  assert.strictEqual(analyzeZss('if command = "anything" {}').issues.some(issue => issue.code === 'missing-command'), false, 'analysis without a completely resolved catalog never guesses that a command is missing');

  const unsaved = resolveCommandCatalog(code, { openDocuments: [{ fileName: command, getText: () => '[Command]\nname = "unsaved"\ncommand = y\n' }] });
  assert.deepStrictEqual(unsaved.names, ['unsaved'], 'unsaved assigned-command text is authoritative for live diagnostics');
  fs.unlinkSync(command);
  assert.strictEqual(resolveCommandCatalog(code).complete, false, 'a missing assigned command file suppresses unsupported missing-reference claims');

  console.log('Resolved character command-reference diagnostics passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
