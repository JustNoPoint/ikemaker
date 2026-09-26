'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { env: {}, UIKind: { Web: 2 } };
  return load.call(this, request, parent, main);
};
const { buildStageRigPlan, rigCommands, rigStates, stageReadout, stageFooter, bgCtrlMonitor, stageRoot, RIG_DIRECTORY } = require('../src/stage_rig');
Module._load = load;

const model = {
  name: 'Camera Test', localCoord: [640, 360],
  playerStarts: [{ x: -90, y: 0 }, { x: 90, y: 0 }],
  movementBounds: [-1200, 1200], screenBounds: [25, 30],
  camera: { bounds: [-300, 300, -160, 20], zoom: [1, 0.75, 1.4], tension: 70, verticalFollow: 0.6, floorTension: 25 },
  stageInfo: { zOffset: 330 },
  controllers: [{ order: 0, name: 'Cloud drift', type: 'velset', time: [10, 20, 60], sctrlid: 7 }]
};

const states = rigStates(model, { speed: 3, stageLabel: 'stages/test.def' });
assert.match(states, /!\(command = "rig_p2"\)/);
assert.match(states, /player\(1\), command = "rig_p2"/);
assert.match(states, /player\(1\), command = "rig_both"/);
assert.match(states, /posAdd\{x: 3 \* map\(IKEMaker_Rig_SweepDirectionX\)\}/);
assert.match(states, /posAdd\{x: -\$rigSpeed\}/);
assert.doesNotMatch(states, /:=\s*-?1\s*\}/, 'inline sweep assignments require a terminating semicolon');
assert.match(states, /stageBackEdgeDist/);
assert.match(states, /screenPos x/);
assert.match(states, /text\{/);
assert.match(states, /globalNoKO/);
assert.match(states, /IKEMaker_Rig_LockMode/);
assert.match(states, /IKEMaker_Rig_SweepMode/);
assert.match(states, /rig_reset_both/);
assert.match(states, /BGCTRL ACTIVE: Cloud drift/);
assert.match(states, /posSet\{x: -90; y: 0\}/);
assert.match(states, /IKEMaker_Rig_HideInfo/);
assert.match(states, /IKEMaker_Rig_HideHelp/);

const commands = rigCommands();
assert.match(commands, /name = "rig_fine"/);
assert.match(commands, /name = "rig_fast"/);
assert.match(commands, /name = "rig_preset"/);
assert.match(commands, /command = a\+b/);
assert.match(commands, /name = "rig_toggle_info"/);
assert.match(commands, /command = b\+c/);
assert.match(commands, /name = "rig_toggle_help"/);
assert.match(commands, /command = y\+z/);

const monitor = bgCtrlMonitor(model);
assert.match(monitor, /schedule windows/);
assert.match(monitor, /every 60/);

const readout = stageReadout(model, 'stages/test.def');
assert.match(readout, /Stage X -1200\.\.1200/);
assert.match(readout, /Camera X -300\.\.300/);

const footer = stageFooter();
assert.match(footer, /D\+DIRECTIONS Move P2/);
assert.match(footer, /W\+DIRECTIONS Move both\/reversed/);
assert.match(footer, /A Reset P1/);
assert.match(footer, /X\+Y Auto sweep/);
assert.match(footer, /B\+C Hide\/show measurements/);
assert.match(footer, /Y\+Z Hide\/show this button guide/);
assert.match(footer, /SCROLL LOCK Advance frame/);

const root = path.resolve('C:/Games/Test');
const plan = buildStageRigPlan(root, model, path.join(root, 'stages', 'test.def'), { speed: 3 });
assert.strictEqual(plan.character, `chars/${RIG_DIRECTORY}/IKEMaker_Stage_Rig.def`);
assert.strictEqual(plan.writes.length, 8);
assert.ok(plan.writes.every(([filename]) => filename.startsWith(path.join(root, 'chars', RIG_DIRECTORY))));
assert.ok(Buffer.isBuffer(plan.writes.find(([filename]) => filename.endsWith('.sff'))[1]));
assert.ok(Buffer.isBuffer(plan.writes.find(([filename]) => filename.endsWith('.snd'))[1]));

const renamedGame = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-stage-rig-root-'));
try {
  fs.mkdirSync(path.join(renamedGame, 'chars'), { recursive: true });
  fs.mkdirSync(path.join(renamedGame, 'data'), { recursive: true });
  fs.mkdirSync(path.join(renamedGame, 'stages'), { recursive: true });
  fs.writeFileSync(path.join(renamedGame, 'data', 'select.def'), '[Characters]\n');
  const nestedStage = path.join(renamedGame, 'stages', 'test.def');
  fs.writeFileSync(nestedStage, '[Info]\n[Camera]\n[PlayerInfo]\n[Bound]\n[StageInfo]\n[BGDef]\n');
  assert.strictEqual(stageRoot(nestedStage), renamedGame, 'renamed packaged games should resolve without Ikemen_GO.exe');
} finally { fs.rmSync(renamedGame, { recursive: true, force: true }); }

console.log('Stage Rig tests passed');
