'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, main); };
const { MapRegistryService } = require('../src/map_registry_service');

const gameRoot = path.resolve(__dirname, '../../../../../..'), source = path.join(gameRoot, 'chars', 'Ryu', 'normals_extras.zss');
if (!fs.existsSync(source)) {
  console.log('Map registry Ryu/SF6 fixture test skipped outside the shared IKEMaker development tree');
  process.exit(0);
}
const uri = (fsPath) => ({ fsPath: path.resolve(fsPath), toString: () => `file:///${path.resolve(fsPath).replace(/\\/g, '/')}` });
const vscode = {
  Uri: { file: uri, parse: (value) => uri(value.replace(/^file:\/\/\//, '')) }, window: {},
  workspace: {
    workspaceFolders: [{ uri: uri(gameRoot) }], textDocuments: [],
    getWorkspaceFolder: () => ({ uri: uri(gameRoot) }),
    getConfiguration: () => ({ get: (_name, fallback) => fallback }),
    openTextDocument: async (documentUri) => ({ fileName: documentUri.fsPath, uri: documentUri, languageId: 'plaintext', getText: () => fs.readFileSync(documentUri.fsPath, 'utf8') })
  }
};

(async () => {
  const service = new MapRegistryService(vscode, { workspaceState: { get: (_key, fallback) => fallback } });
  const result = await service.scan(uri(source));
  const counts = Object.fromEntries(result.scopes.map((scope) => [scope.id, scope.fileCount]));
  assert.strictEqual(counts.character, 3, 'the real Ryu fixture retains its two character-local code files plus its DEF map authority');
  assert(counts.template >= 20, 'the active SF6 template retains the established shared/runtime code baseline');
  assert.strictEqual(counts.assigned, counts.template, 'the assigned scope balances the runtime template set plus the character DEF map authority');
  assert.strictEqual(counts.available, counts.character + counts.template, 'the available scope is the exact character/template union without hidden or duplicate files');
  assert.ok(result.entries.length > 1, 'the full character/template index must not collapse to the active panel\'s two files');
  assert.ok(result.scopes.find((scope) => scope.id === 'assigned').default);
  console.log(`Map registry real Ryu/SF6 fixture exposes ${counts.character}/${counts.template}/${counts.assigned}/${counts.available} scoped code files`);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
