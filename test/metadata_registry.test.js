'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const metadata = require('../src/metadata_registry');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-registry-'));
try {
  const folder = path.join(root, '.ikemen'); fs.mkdirSync(folder); const alias = path.join(root, '.ikemen-sff-aliases.json'); fs.writeFileSync(alias, '{"aliases":{"families":{"fb":"Fireball"}}}');
  const registryFile = path.join(folder, 'project-registry.json'), indexed = metadata.indexLegacySources(registryFile, { schemaVersion: 2 }, [alias]);
  assert.strictEqual(indexed.indexed[0].domain, 'aliases'); fs.writeFileSync(registryFile, JSON.stringify(indexed.registry));
  const resolved = metadata.resolve(path.join(root, 'chars', 'Ryu', 'Ryu.sff'), 'aliases'); assert.strictEqual(resolved.value.aliases.families.fb, 'Fireball');
  assert.strictEqual(metadata.selection({ default: 1, projects: { sf6: 2 } }, { projectId: 'sf6' }), 2);
  const nested = path.join(root, 'nested'), shared = path.join(nested, 'chars', 'template', '.ikemen'); fs.mkdirSync(shared, { recursive: true }); fs.writeFileSync(path.join(shared, 'project-registry.json'), JSON.stringify({ schemaVersion: 2 }));
  assert.strictEqual(metadata.find(path.join(nested, 'chars', 'Ryu', 'Ryu.def')), path.join(shared, 'project-registry.json'));
  const parentGame = path.join(root, 'parent-game'), parentRegistry = path.join(parentGame, 'chars', 'template', '.ikemen');
  fs.mkdirSync(parentRegistry, { recursive: true }); fs.writeFileSync(path.join(parentRegistry, 'project-registry.json'), JSON.stringify({ schemaVersion: 2 }));
  const childGame = path.join(parentGame, 'child-game'); fs.mkdirSync(path.join(childGame, 'chars', 'Ryu'), { recursive: true }); fs.writeFileSync(path.join(childGame, 'Ikemen_GO.exe'), '');
  assert.strictEqual(metadata.find(path.join(childGame, 'chars', 'Ryu', 'Ryu.def')), null, 'nested game must not inherit its parent game registry');
  const childRegistry = path.join(childGame, 'chars', 'template', '.ikemen'); fs.mkdirSync(childRegistry, { recursive: true }); fs.writeFileSync(path.join(childRegistry, 'project-registry.json'), JSON.stringify({ schemaVersion: 2 }));
  assert.strictEqual(metadata.find(path.join(childGame, 'chars', 'Ryu', 'Ryu.def')), path.join(childRegistry, 'project-registry.json'));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Metadata registry tests passed');
