'use strict';

const assert = require('assert');
const path = require('path');
const recentFolders = require('../src/recent_folders');

const values = new Map();
const storage = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => values.set(key, value) };
const api = { Uri: { file: (fsPath) => ({ fsPath }) } };
const directory = path.resolve('C:/palette-library');
const file = path.join(directory, 'ryu.act');
const fsApi = { statSync: (target) => ({ isDirectory: () => target === directory }) };

(async () => {
  recentFolders.configure({ globalState: storage });
  assert.strictEqual(recentFolders.defaultUri(api, 'paletteReferenceSources', fsApi), undefined);
  assert.strictEqual(await recentFolders.rememberSelection('paletteReferenceSources', [{ fsPath: file }], fsApi), true);
  assert.strictEqual(values.get(recentFolders.STORAGE_KEY).paletteReferenceSources, directory);

  recentFolders.configure({ globalState: storage });
  assert.deepStrictEqual(recentFolders.defaultUri(api, 'paletteReferenceSources', fsApi), { fsPath: directory }, 'remembered folder survives extension restart');
  assert.strictEqual(await recentFolders.rememberSelection('paletteReferenceSources', [], fsApi), false, 'cancel does not replace the remembered folder');
  assert.strictEqual(values.get(recentFolders.STORAGE_KEY).paletteReferenceSources, directory);
  assert.strictEqual(recentFolders.defaultUri(api, 'paletteReferenceSources', { statSync() { throw new Error('missing'); } }), undefined, 'missing folders are ignored safely');

  console.log('recent folder tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
