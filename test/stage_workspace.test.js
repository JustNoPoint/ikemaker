'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {};
  return load.call(this, request, parent, main);
};
const { stagePayload, stageHtml, gameRoot } = require('../src/stage_workspace');
const { workspaceExperience } = require('../src/experience_model');
Module._load = load;

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-stage-workspace-'));
try {
  const parentGame = path.join(directory, 'developer-install');
  const packagedGame = path.join(parentGame, 'renamed-game');
  fs.mkdirSync(path.join(parentGame, 'data'), { recursive: true });
  fs.mkdirSync(path.join(packagedGame, 'chars'), { recursive: true });
  fs.mkdirSync(path.join(packagedGame, 'data'), { recursive: true });
  fs.writeFileSync(path.join(parentGame, 'Ikemen_GO.exe'), '');
  fs.writeFileSync(path.join(packagedGame, 'data', 'select.def'), '[Characters]\n');
  assert.strictEqual(gameRoot(path.join(packagedGame, 'data', 'select.def')), packagedGame);

  const filename = path.join(directory, 'sample.def');
  fs.writeFileSync(filename, `[Info]\nname = "Sample"\n[Camera]\nboundleft=-100\nboundright=100\n[PlayerInfo]\np1startx=-40\np2startx=40\n[Bound]\nscreenleft=15\nscreenright=15\n[StageInfo]\nlocalcoord=320,240\nzoffset=220\n[BGDef]\nspr=missing.sff\n[BG Floor]\ntype=parallax\nspriteno=1,0\nstart=0,220\nwidth=320,640\n`, 'utf8');
  const payload = stagePayload(filename);
  assert.strictEqual(payload.model.name, 'Sample');
  assert.strictEqual(payload.model.backgrounds[0].parallax.mode, 'width');
  assert.ok(payload.sffError);
  const html = stageHtml(payload);
  const clientScript = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(clientScript, 'stage workspace should contain a client script');
  assert.doesNotThrow(() => new Function(clientScript[1]), 'generated stage workspace JavaScript should compile');
  assert.match(html, /Stage Workspace/);
  assert.match(html, /Stage Rig/);
  assert.match(html, /Capture A/);
  assert.match(html, /Camera preset/);
  assert.match(html, /BGCtrl timeline/);
  assert.match(html, /Launch with these speeds/);
  assert.match(html, /launchStageRig/);
  assert.match(html, /Apply reviewed position/);
  assert.match(html, /cameraZoom/);
  assert.match(html, /drawParallax/);
  assert.match(html, /attached character/);
  assert.match(html, /Direct save/);
  assert.match(html, /Stage · Learning/);
  assert.match(html, /<details open><summary><b>What am I editing\?/);
  assert.match(html, /class="guided-workflow"/);
  assert.match(html, /\[Review\] Confirm local coordinates and camera bounds/);
  assert.match(html, /data-workflow-action="anchor:backgrounds"/);
  assert.match(html, /class="task-recipes" open/);
  assert.match(html, /Prove the camera before decorating/);
  assert.match(html, /closest\('\[data-workflow-action\]'\)/);
  assert.doesNotMatch(html, /Advanced shortcuts/);
  const advanced = stageHtml(stagePayload(filename, workspaceExperience('stage', 'advanced')));
  assert.match(advanced, /Stage · Advanced/);
  assert.doesNotMatch(advanced, /<details open><summary><b>What am I editing\?/);
  assert.match(advanced, /class="guided-workflow"/);
  assert.match(advanced, /Advanced shortcuts/);
  assert.match(advanced, /class="task-recipes"/);
  assert.doesNotMatch(advanced, /class="task-recipes" open/);
  assert.match(advanced, /data-workflow-action="control:apply"/);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Stage workspace tests passed');
