'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { characterDefs, owningCharacterDefs } = require('../src/character_context');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-context-'));
try {
  fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
  const shared = path.join(root, 'chars', 'template'); fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'template.jnp'), '[Command]\nname="x"\ncommand=x\n');
  fs.writeFileSync(path.join(shared, 'template.def'), '[Files]\ncmd = template.jnp\n');
  const ryu = path.join(root, 'chars', 'Ryu'); fs.mkdirSync(ryu, { recursive: true });
  fs.writeFileSync(path.join(ryu, 'Ryu_movelist.dat'), 'RYU');
  fs.writeFileSync(path.join(ryu, 'Ryu.def'), '[Files]\ncmd = ../template/template.jnp\nmovelist = Ryu_movelist.dat\n');
  const nested = path.join(root, 'chars', 'ZBonus', 'FarmerZ2'); fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'FarmerZ2.def'), '[Files]\nsprite = FarmerZ2.sff\n');
  for (const ignored of ['backup', 'backups', '_backup', 'archive', '.pnpm-store', 'System.Management.Automation.Internal.Host.InternalHost']) {
    const folder = path.join(root, 'chars', ignored, 'Duplicate'); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'Duplicate.def'), '[Files]\nsprite = Duplicate.sff\n');
  }
  const discovered = characterDefs(root);
  assert(discovered.includes(path.join(ryu, 'Ryu.def')));
  assert(discovered.includes(path.join(nested, 'FarmerZ2.def')), 'legitimate nested bonus characters remain discoverable');
  assert.strictEqual(discovered.some((filename) => /Duplicate\.def$/i.test(filename)), false, 'generated, archive, and backup trees are ignored');
  assert.deepStrictEqual(owningCharacterDefs(path.join(shared, 'template.jnp'), 'chars/Ryu/Ryu.def'), [path.join(ryu, 'Ryu.def'), path.join(shared, 'template.def')].sort((a,b)=>a.localeCompare(b)), 'every real shared owner is returned even when one has no displayed movelist');
  assert.deepStrictEqual(owningCharacterDefs(path.join(ryu, 'Ryu_movelist.dat'), ''), [path.join(ryu, 'Ryu.def')], 'a direct DAT resolves through the movelist assignment rather than the command assignment');
  assert.deepStrictEqual(owningCharacterDefs(path.join(ryu, 'Ryu.def'), ''), [path.join(ryu, 'Ryu.def')]);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Character command/movelist ownership tests passed');
