'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const registryModel = require('../src/project_registry');
const mutationSafety = require('../src/mutation_safety');
const registryEvents = require('../src/project_registry_events');

const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-profile-composition-'));
let openAnswer = undefined, inputs = [], picks = [], injectStale = false, injectAbsentCreate = false;
const commands = [], errors = [], transactions = [], events = [];
let workspaceMembershipChanges = 0;
const uri = fsPath => ({ scheme: 'file', fsPath: path.resolve(fsPath) });
const vscode = {
  Uri: { file: uri },
  window: {
    activeTextEditor: null,
    tabGroups: { activeTabGroup: null, all: [] },
    visibleTextEditors: [],
    showOpenDialog: async () => openAnswer,
    showInputBox: async () => inputs.shift(),
    showQuickPick: async (items, options) => {
      const answer = picks.shift();
      return typeof answer === 'function' ? answer(items, options) : answer;
    },
    showTextDocument: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async message => { errors.push(message); return undefined; }
  },
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: () => null,
    updateWorkspaceFolders: () => { workspaceMembershipChanges += 1; return true; },
    openTextDocument: async value => value
  },
  commands: { executeCommand: async (...args) => { commands.push(args); } }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './mutation_safety' && /project_context_ui\.js$/i.test(parent?.filename || '')) {
    return {
      ...mutationSafety,
      transactionalWrite(fsModule, filename, content, options) {
        transactions.push({ filename: path.resolve(filename), options: { ...options } });
        if (injectAbsentCreate) {
          injectAbsentCreate = false;
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          fs.writeFileSync(filename, `${JSON.stringify({ external: true }, null, 2)}\n`);
        }
        if (injectStale) {
          injectStale = false;
          fs.writeFileSync(filename, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(filename, 'utf8')), registryVersion: 999 }, null, 2)}\n`);
        }
        return mutationSafety.transactionalWrite(fsModule, filename, content, options);
      }
    };
  }
  return originalLoad.call(this, request, parent, main);
};
const { createProjectProfile } = require('../src/project_context_ui');
const originalNormalize = registryModel.normalize;
let injectDuringNormalize = null;
registryModel.normalize = function normalizeWithRace(registry) {
  const normalized = originalNormalize(registry);
  if (injectDuringNormalize) {
    const target = injectDuringNormalize;
    injectDuringNormalize = null;
    fs.writeFileSync(target, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(target, 'utf8')), registryVersion: 777 }, null, 2)}\n`);
  }
  return normalized;
};

function chooseValue(value) { return items => items.find(item => item.value === value); }
function chooseLocation(index) { return items => items[index]; }
function files(root) {
  const found = [];
  const visit = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute); else found.push(path.relative(root, absolute).replace(/\\/g, '/'));
    }
  };
  visit(root);
  return found.sort();
}
function answers(root, name = 'New Game', id = 'new-game', prefix = []) {
  openAnswer = [{ fsPath: root }];
  inputs = [name, id];
  picks = [...prefix, chooseValue('hobby'), chooseValue('original'), chooseValue(false)];
}
async function cancelledAt(label, configure) {
  const root = fs.mkdtempSync(path.join(sandboxRoot, `${label}-`));
  const beforeTransactions = transactions.length, beforeEvents = events.length;
  openAnswer = [{ fsPath: root }]; inputs = []; picks = [];
  configure(root);
  await createProjectProfile();
  assert.deepStrictEqual(files(root), [], `${label} cancellation creates no registry or side file`);
  assert.strictEqual(transactions.length, beforeTransactions, `${label} cancellation never reaches the writer`);
  assert.strictEqual(events.length, beforeEvents, `${label} cancellation emits no registry event`);
}

(async () => {
  const subscription = registryEvents.onDidChangeProjectRegistry(event => events.push(event));
  try {
    openAnswer = undefined; inputs = []; picks = [];
    await createProjectProfile();
    assert.strictEqual(transactions.length, 0, 'folder cancellation is inert');
    await cancelledAt('name', () => { inputs = [undefined]; });
    await cancelledAt('id', () => { inputs = ['Cancel ID', undefined]; });
    await cancelledAt('distribution', () => { inputs = ['Cancel Distribution', 'cancel-distribution']; picks = [undefined]; });
    await cancelledAt('basis', () => { inputs = ['Cancel Basis', 'cancel-basis']; picks = [chooseValue('hobby'), undefined]; });
    await cancelledAt('research', () => { inputs = ['Cancel Research', 'cancel-research']; picks = [chooseValue('hobby'), chooseValue('original'), undefined]; });

    const fresh = fs.mkdtempSync(path.join(sandboxRoot, 'fresh-'));
    answers(fresh, 'Fresh Game', 'fresh-game');
    const beforeFresh = transactions.length;
    await createProjectProfile();
    const freshRegistry = path.join(fresh, '.ikemen', 'project-registry.json');
    assert.strictEqual(transactions.length, beforeFresh + 1);
    assert.strictEqual(transactions.at(-1).filename, path.resolve(freshRegistry));
    assert.strictEqual(transactions.at(-1).options.expectedHash, mutationSafety.hash(Buffer.alloc(0)), 'a new absent registry carries explicit absence authority');
    assert.strictEqual(transactions.at(-1).options.journal, undefined, 'profile creation requests no persistent backup or journal');
    assert(JSON.parse(fs.readFileSync(freshRegistry, 'utf8')).projects.some(item => item.id === 'fresh-game'));
    assert.deepStrictEqual(files(fresh), ['.ikemen/project-registry.json']);
    assert.strictEqual(commands.at(-1)[0], 'ikemen.projectManager.open');
    assert.strictEqual(path.resolve(commands.at(-1)[1].fsPath), path.resolve(fresh), 'success returns to the exact selected project root in Project Manager');

    const shared = fs.mkdtempSync(path.join(sandboxRoot, 'shared-'));
    const sharedRegistry = path.join(shared, '.ikemen', 'project-registry.json'), importedRoot = path.join(shared, 'games', 'Imported');
    fs.mkdirSync(path.dirname(sharedRegistry), { recursive: true }); fs.mkdirSync(importedRoot, { recursive: true });
    const sharedBefore = `${JSON.stringify(registryModel.createStarter(), null, 2)}\n`; fs.writeFileSync(sharedRegistry, sharedBefore);
    answers(importedRoot, 'Imported Existing Root', 'imported-root', [chooseLocation(0)]);
    await createProjectProfile();
    const importedCall = transactions.at(-1);
    assert.strictEqual(importedCall.filename, path.resolve(sharedRegistry), 'the detected-registry choice updates that exact authority');
    assert.strictEqual(importedCall.options.expectedHash, mutationSafety.hash(Buffer.from(sharedBefore)), 'existing-registry adoption carries the exact prior-byte hash');
    const imported = JSON.parse(fs.readFileSync(sharedRegistry, 'utf8')).projects.find(item => item.id === 'imported-root');
    assert.deepStrictEqual(imported.roots, ['games/Imported'], 'the imported root is recorded relative to the detected registry');
    assert(!fs.existsSync(path.join(importedRoot, '.ikemen')), 'existing-registry adoption creates no second registry');

    const independentRoot = path.join(shared, 'games', 'Independent'); fs.mkdirSync(independentRoot, { recursive: true });
    const sharedStable = fs.readFileSync(sharedRegistry);
    answers(independentRoot, 'Independent Root', 'independent-root', [chooseLocation(1)]);
    await createProjectProfile();
    const independentRegistry = path.join(independentRoot, '.ikemen', 'project-registry.json');
    assert(fs.existsSync(independentRegistry), 'the explicit independent-boundary choice creates its exact child registry');
    assert.deepStrictEqual(fs.readFileSync(sharedRegistry), sharedStable, 'the independent choice leaves the detected parent registry unchanged');

    const staleRoot = path.join(shared, 'games', 'Stale'); fs.mkdirSync(staleRoot, { recursive: true });
    const stableBeforeRace = fs.readFileSync(sharedRegistry); const eventsBeforeRace = events.length, commandsBeforeRace = commands.length;
    answers(staleRoot, 'Stale Root', 'stale-root', [chooseLocation(0)]); injectStale = true;
    await createProjectProfile();
    assert.match(errors.at(-1) || '', /was not overwritten.*changed after it was loaded/i, 'a stale profile write is contained and reported by its command owner');
    const racedBytes = fs.readFileSync(sharedRegistry);
    assert.notDeepStrictEqual(racedBytes, stableBeforeRace, 'the external race fixture changed the registry before the transaction');
    assert.strictEqual(JSON.parse(racedBytes).registryVersion, 999, 'stale rejection preserves the exact external winner');
    assert.strictEqual(events.length, eventsBeforeRace, 'stale rejection emits no success event');
    assert.strictEqual(commands.length, commandsBeforeRace, 'stale rejection does not falsely open Project Manager as a success return');
    assert(!fs.readdirSync(path.dirname(sharedRegistry)).some(name => /\.tmp$|\.rollback$/.test(name)), 'stale rejection leaves no transient transaction material');

    const prewriteRaceRoot = path.join(shared, 'games', 'PrewriteRace'); fs.mkdirSync(prewriteRaceRoot, { recursive: true });
    const stableBeforePrewriteRace = fs.readFileSync(sharedRegistry); const eventsBeforePrewriteRace = events.length, commandsBeforePrewriteRace = commands.length;
    answers(prewriteRaceRoot, 'Prewrite Race', 'prewrite-race', [chooseLocation(0)]); injectDuringNormalize = sharedRegistry;
    await createProjectProfile();
    assert.match(errors.at(-1) || '', /was not overwritten.*changed after it was loaded/i, 'a mutation after the authoritative source read is rejected');
    assert.strictEqual(JSON.parse(fs.readFileSync(sharedRegistry, 'utf8')).registryVersion, 777, 'the mutation after the source read remains the exact external winner');
    assert.notDeepStrictEqual(fs.readFileSync(sharedRegistry), stableBeforePrewriteRace, 'the pre-write race fixture changed the source after its authoritative read');
    assert.strictEqual(events.length, eventsBeforePrewriteRace, 'the pre-write race emits no success event');
    assert.strictEqual(commands.length, commandsBeforePrewriteRace, 'the pre-write race does not report a successful return');

    const absentRaceRoot = fs.mkdtempSync(path.join(sandboxRoot, 'absent-race-'));
    const absentRegistry = path.join(absentRaceRoot, '.ikemen', 'project-registry.json'); const eventsBeforeAbsentRace = events.length, commandsBeforeAbsentRace = commands.length;
    answers(absentRaceRoot, 'Absent Race', 'absent-race'); injectAbsentCreate = true;
    await createProjectProfile();
    assert.match(errors.at(-1) || '', /was not overwritten.*changed after it was loaded/i, 'an externally created formerly absent registry is rejected');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(absentRegistry, 'utf8')), { external: true }, 'the externally created registry remains untouched');
    assert.strictEqual(events.length, eventsBeforeAbsentRace, 'the absent-to-created race emits no success event');
    assert.strictEqual(commands.length, commandsBeforeAbsentRace, 'the absent-to-created race does not report a successful return');

    const vanishedRaceRoot = fs.mkdtempSync(path.join(sandboxRoot, 'vanished-race-'));
    const vanishedRegistry = path.join(vanishedRaceRoot, '.ikemen', 'project-registry.json'); fs.mkdirSync(path.dirname(vanishedRegistry), { recursive: true }); fs.writeFileSync(vanishedRegistry, '{}\n');
    const originalReadFileSync = fs.readFileSync; let injectedVanishedRead = false;
    fs.readFileSync = function readWithVanishedRace(target, ...args) {
      if (!injectedVanishedRead && path.resolve(target) === path.resolve(vanishedRegistry)) {
        injectedVanishedRead = true;
        fs.readFileSync = originalReadFileSync;
        fs.rmSync(vanishedRegistry);
        originalReadFileSync.call(fs, __filename);
        fs.writeFileSync(vanishedRegistry, `${JSON.stringify({ externalAfterEnoent: true }, null, 2)}\n`);
        const error = new Error('simulated disappearance during authoritative read'); error.code = 'ENOENT'; throw error;
      }
      return originalReadFileSync.call(fs, target, ...args);
    };
    const eventsBeforeVanishedRace = events.length, commandsBeforeVanishedRace = commands.length;
    try { answers(vanishedRaceRoot, 'Vanished Race', 'vanished-race'); await createProjectProfile(); }
    finally { fs.readFileSync = originalReadFileSync; }
    assert(injectedVanishedRead, 'the read-time disappearance fixture reached the authoritative read');
    assert.match(errors.at(-1) || '', /was not overwritten.*changed after it was loaded/i, 'read-time ENOENT becomes explicit absence authority and rejects a replacement');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(vanishedRegistry, 'utf8')), { externalAfterEnoent: true }, 'the replacement created after read-time ENOENT remains untouched');
    assert.strictEqual(events.length, eventsBeforeVanishedRace, 'the read-time disappearance race emits no success event');
    assert.strictEqual(commands.length, commandsBeforeVanishedRace, 'the read-time disappearance race does not report a successful return');

    assert.strictEqual(workspaceMembershipChanges, 0, 'profile creation records registry metadata without silently changing VS Code workspace membership');
    assert(events.every(event => event.reason === 'create-game-project-profile'), 'every successful profile write publishes its exact reason');
    console.log('Game profile composition covers cancellation, fresh/detected/independent roots, exact single-snapshot authority, stale and absent-target races, return, and no implicit workspace membership');
  } finally {
    subscription.dispose();
    registryModel.normalize = originalNormalize;
    Module._load = originalLoad;
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
