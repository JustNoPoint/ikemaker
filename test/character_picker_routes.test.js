'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-character-picker-routes-'));
const game = path.join(root, 'game'), chars = path.join(game, 'chars');
fs.mkdirSync(chars, { recursive: true }); fs.writeFileSync(path.join(game, 'Ikemen_GO.exe'), '');
function character(name) {
  const folder = path.join(chars, name), filename = path.join(folder, `${name}.def`);
  fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(filename, `[Info]\nname=${name}\n[Files]\nsprite=${name}.sff\n`);
  return filename;
}
const ryu = character('Ryu'), ken = character('Ken'), template = character('template');
const invalid = path.join(chars, 'notes.def'); fs.writeFileSync(invalid, '[Info]\nname=Not a character\n');

let quick = [], opened = [], warnings = [];
const uri = fsPath => ({ scheme: 'file', fsPath: path.resolve(fsPath) });
const vscode = {
  Uri: { file: uri },
  window: {
    activeTextEditor: null,
    tabGroups: { all: [] },
    showQuickPick: async (items, options) => {
      const answer = quick.shift();
      return typeof answer === 'function' ? answer(items, options) : answer;
    },
    showOpenDialog: async () => opened.shift(),
    showWarningMessage: async message => { warnings.push(message); }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(game) }],
    textDocuments: [],
    getConfiguration: () => ({ get: (_key, fallback) => fallback })
  }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return vscode; return originalLoad.call(this, request, parent, main); };
const picker = require('../src/character_picker');

(async () => {
  try {
    assert.strictEqual(await picker.chooseCharacterDef(uri(ryu)), ryu, 'an exact valid DEF seed returns without another chooser');

    vscode.workspace.textDocuments = [{ fileName: template, uri: uri(template) }, { fileName: ryu, uri: uri(ryu) }];
    const candidates = picker.characterCandidates();
    assert.strictEqual(candidates.current[0], ryu, 'a concrete open character ranks ahead of an open shared template');
    assert(candidates.current.includes(template), 'the explicit template entry remains available rather than disappearing');
    assert(candidates.detected.includes(ken), 'workspace/game discovery exposes other exact character DEF entries');

    quick = [items => items.find(item => item.filename === ken)];
    assert.strictEqual(await picker.chooseCharacterDef(undefined, { title: 'Open Character' }), ken, 'a detected project character resolves to its exact DEF');

    quick = [items => items.find(item => item.browse === 'file')]; opened = [[uri(ryu)]];
    assert.strictEqual(await picker.chooseCharacterDef(), ryu, 'Browse for character DEF returns the exact validated file');

    quick = [items => items.find(item => item.browse === 'file')]; opened = [[uri(invalid)]]; const beforeWarnings = warnings.length;
    assert.strictEqual(await picker.chooseCharacterDef(), '', 'an invalid DEF is not imported as a character owner');
    assert.strictEqual(warnings.length, beforeWarnings + 1);
    assert.match(warnings.at(-1), /not a main character DEF/);

    quick = [items => items.find(item => item.browse === 'folder'), items => items.find(item => item.filename === ken)]; opened = [[uri(chars)]];
    assert.strictEqual(await picker.chooseCharacterDef(), ken, 'folder browse scans then returns the explicitly selected exact character DEF');

    quick = [undefined]; opened = []; const warningCount = warnings.length;
    assert.strictEqual(await picker.chooseCharacterDef(), '', 'canceling the entry picker is inert');
    assert.strictEqual(warnings.length, warningCount, 'ordinary cancellation produces no false error');
    console.log('Character picker routes cover exact seed, detected project, folder, DEF, template ranking, validation, and cancellation');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
