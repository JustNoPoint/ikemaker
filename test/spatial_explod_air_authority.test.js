'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { hash } = require('../src/mutation_safety');
const { parseAir } = require('../src/air_preview_model');

const source = fs.readFileSync(path.join(__dirname, '../src/spatial_composer_workspace.js'), 'utf8');
const body = source.slice(source.indexOf('function explodAirAuthority('), source.indexOf('function explodInspectionContext('));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-explod-air-authority-'));

try {
  const defPath = path.join(root, 'Hero.def'), airPath = path.join(root, 'Hero.air');
  fs.writeFileSync(defPath, '[Files]\nanim = Hero.air\n');
  fs.writeFileSync(airPath, '[Begin Action 12]\n0, 0, 0, 0, 1\n');
  const vscode = { workspace: { textDocuments: [] } };
  const sandbox = {
    Buffer, fs, path, vscode, hash,
    MAX_DEF_AUTHORITY_BYTES: 1024,
    MAX_AIR_AUTHORITY_BYTES: 64,
    fileKey: filename => path.resolve(filename || '').toLowerCase(),
    resolveAssigned: (filename, text) => {
      const match = /^\s*anim\s*=\s*(.+?)\s*$/im.exec(text);
      return { air: match ? path.resolve(path.dirname(filename), match[1]) : '' };
    },
    require: name => { assert.strictEqual(name, './air_preview_model'); return { parseAir }; }
  };
  vm.runInNewContext(body, sandbox);
  const projection = { fields: [{ name: 'anim', status: 'literal', literal: true, value: 12 }] };
  const ready = sandbox.explodAirAuthority(defPath, projection);
  assert.strictEqual(ready.public.available, true);
  assert.strictEqual(ready.authority.defHash, hash(fs.readFileSync(defPath, 'utf8')), 'the assignment source is part of exact AIR authority');

  vscode.workspace.textDocuments = [{ fileName: defPath, isClosed: false, isDirty: true, getText: () => '[Files]\nanim = Other.air\n' }];
  assert.strictEqual(sandbox.explodAirAuthority(defPath, projection).public.available, false, 'a dirty DEF reassignment fails closed');
  vscode.workspace.textDocuments = [{ fileName: defPath, isClosed: false, isDirty: true, getText: () => '[Files]\n' }];
  assert.strictEqual(sandbox.explodAirAuthority(defPath, projection).public.available, false, 'a dirty DEF assignment removal fails closed');

  vscode.workspace.textDocuments = [];
  fs.writeFileSync(airPath, '[Begin Action 12]\n0, 0, 0, 0, 1\n[Begin Action 12]\n1, 0, 0, 0, 1\n');
  const duplicate = sandbox.explodAirAuthority(defPath, projection);
  assert.strictEqual(duplicate.public.available, false);
  assert.match(duplicate.public.reason, /multiple Action 12.*ambiguous/, 'duplicate action numbers never receive exact navigation authority');

  fs.writeFileSync(airPath, ' '.repeat(65));
  const oversized = sandbox.explodAirAuthority(defPath, projection);
  assert.strictEqual(oversized.public.available, false);
  assert.match(oversized.public.reason, /exceeds the exact-navigation limit/, 'oversized AIR is rejected before parsing');
  console.log('Spatial existing-Explod AIR authority binds the saved DEF assignment and rejects dirty or oversized sources');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
