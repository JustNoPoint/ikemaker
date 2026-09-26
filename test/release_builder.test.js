'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return { env: {}, window: {}, workspace: {} };
  return originalLoad.call(this, request, parent, isMain);
};

const { matcher, matches, findGameRoot, profileTemplate, capturePlan, auditProfile, shouldCopy, discoverScreenpacks, nextDecimalVersion, setDefValue } = require('../src/release_builder');
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-release-test-'));
fs.mkdirSync(path.join(root, 'save', 'logs'), { recursive: true });
fs.mkdirSync(path.join(root, 'save', 'palettes', 'Ryu'), { recursive: true });
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.mkdirSync(path.join(root, 'chars', 'Ryu'), { recursive: true });
fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), 'fixture');
fs.writeFileSync(path.join(root, 'save', 'config.ini'), '[Options]\nDifficulty = 4\n');
fs.writeFileSync(path.join(root, 'save', 'stats.json'), '{}\n');
fs.writeFileSync(path.join(root, 'data', 'system.def'), '[Info]\nname = "Fixture"\n\n[Title Info]\nmenu.pos = 160,120\n\n[Select Info]\npos = 160,120\n');
fs.writeFileSync(path.join(root, 'data', 'custom-theme.def'), '[Title Info]\nmenu.pos = 0,0\n\n[Select Info]\npos = 0,0\n');
fs.writeFileSync(path.join(root, 'save', 'logs', 'log.txt'), 'transient');
fs.writeFileSync(path.join(root, 'save', 'palettes', 'Ryu', 'user.act'), 'transient');
fs.writeFileSync(path.join(root, 'chars', 'Ryu', 'Ryu.sff'), 'fixture-sff');
fs.mkdirSync(path.join(root, 'chars', 'template', 'development'), { recursive: true });
fs.writeFileSync(path.join(root, 'chars', 'template', 'development', 'fixture.sff'), 'not-runtime');
fs.mkdirSync(path.join(root, 'OtherGame', 'chars'), { recursive: true });
fs.mkdirSync(path.join(root, 'OtherGame', 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'OtherGame', 'HDBZWin.exe'), 'fixture');
fs.writeFileSync(path.join(root, 'OtherGame', 'chars', 'fixture.sff'), 'not-runtime');

assert(matcher('**/*').test('Ikemen_GO.exe'), 'full-copy wildcard must include top-level files');
assert(matches('save/logs/a.txt', ['save/logs/**']));
assert.strictEqual(findGameRoot(path.join(root, 'chars', 'Ryu')), root);
assert.deepStrictEqual(discoverScreenpacks(root), ['data/custom-theme.def', 'data/system.def']);
assert.strictEqual(nextDecimalVersion('1.0'), '1.1');
assert.strictEqual(nextDecimalVersion('1.9'), '2.0');
assert.strictEqual(nextDecimalVersion('Named Build'), '0.1');
assert.match(setDefValue('[Title Info]\nmenu.pos = 0,0\n', 'Title Info', 'footer.version.text', 'Version 1.1'), /footer\.version\.text = Version 1\.1/);
assert.match(setDefValue('[Title Info]\nfooter.version.text = Old\n', 'Title Info', 'footer.version.text', 'Launch Edition'), /footer\.version\.text = Launch Edition/);

let profile = profileTemplate(root);
assert.strictEqual(profile.reviewed, false);
assert(profile.sff.some((entry) => entry.path === 'chars/Ryu/Ryu.sff'));
assert(!profile.sff.some((entry) => /development|OtherGame/.test(entry.path)), 'support files and nested games must not enter release asset discovery');
assert.equal(shouldCopy('chars/template/development/library.js', { copy: { include: ['**'], exclude: [] } }), false, 'old release profiles cannot reintroduce tooling');
assert.deepStrictEqual(profile.versioning.screenpacks, ['data/custom-theme.def', 'data/system.def']);
assert.strictEqual(profile.versioning.current, '0.0');
assert.strictEqual(shouldCopy('Ikemen_GO.exe', profile), true);
assert.strictEqual(shouldCopy('save/palettes/Ryu/user.act', profile), false);
assert.strictEqual(shouldCopy('external/mods/IKEMaker_test_session.lua', profile), false);
assert.strictEqual(shouldCopy('.ikemen/tests/project-tests.json', profile), false);
assert.strictEqual(shouldCopy('.ikemen/test-sessions/session-1.json', profile), false);

const capture = capturePlan(root, profile);
assert(capture.profile.snapshot.files.some((entry) => entry.path === 'save/config.ini'));
assert(!capture.profile.snapshot.files.some((entry) => entry.path.includes('palettes')));
for (const [filename, content] of capture.writes) { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content); }

let audit = auditProfile(root, capture.profile);
assert(audit.issues.some((issue) => issue.includes('not been reviewed')));
assert(audit.issues.some((issue) => issue.includes('strategy is unresolved')));

profile = JSON.parse(JSON.stringify(capture.profile));
profile.reviewed = true;
profile.sff = profile.sff.map((entry) => ({ ...entry, strategy: 'verified-cropped' }));
audit = auditProfile(root, profile);
assert.deepStrictEqual(audit.issues, []);

fs.writeFileSync(path.join(root, 'data', 'new.sff'), 'new');
audit = auditProfile(root, profile);
assert(audit.issues.some((issue) => issue.includes('strategy is unresolved') && issue.includes('data/new.sff')));

fs.rmSync(root, { recursive: true, force: true });
console.log('Release builder tests passed');
