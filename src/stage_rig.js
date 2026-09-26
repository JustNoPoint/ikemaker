'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const engineLocator = require('./engine_locator');
const { blankSff, blankSnd } = require('./asset_templates');
const { transactionalWriteSet } = require('./mutation_safety');
const { parseDef, kind } = require('./def_model');
const { stageModel } = require('./stage_model');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');

const RIG_DIRECTORY = '.ikemaker-stage-rig';
const RIG_DEF = 'IKEMaker_Stage_Rig.def';

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function compact(value) {
  return String(Math.round(numeric(value) * 1000) / 1000);
}

function quoted(value) {
  return String(value || '').replace(/["\\\r\n]/g, ' ');
}

function rigConstants() {
  return `[Data]
life = 999999
attack = 0
defence = 999999
fall.defence_up = 0
liedown.time = 1
airjuggle = 0
sparkno = -1
guard.sparkno = -1
KO.echo = 0
volume = 0
IntPersistIndex = 60
FloatPersistIndex = 40

[Size]
xscale = 1
yscale = 1
ground.back = 0
ground.front = 0
air.back = 0
air.front = 0
height = 0
attack.dist = 0
proj.attack.dist = 0
proj.doscale = 0
head.pos = 0, 0
mid.pos = 0, 0
shadowoffset = 0
draw.offset = 0, 0

[Velocity]
walk.fwd = 0
walk.back = 0
run.fwd = 0, 0
run.back = 0, 0
jump.neu = 0, 0
jump.back = 0
jump.fwd = 0

[Movement]
airjump.num = 0
airjump.height = 0
yaccel = 0
stand.friction = 1
crouch.friction = 1
`;
}

function rigCommands() {
  return `# IKEMaker Stage Rig controls. These use the player's configured IKEMEN buttons.
[Defaults]
command.time = 1
command.buffer.time = 1

[Command]
name = "holdfwd"
command = /$F
time = 1

[Command]
name = "holdback"
command = /$B
time = 1

[Command]
name = "holdup"
command = /$U
time = 1

[Command]
name = "holddown"
command = /$D
time = 1

[Command]
name = "rig_p2"
command = /d
time = 1

[Command]
name = "rig_both"
command = /w
time = 1

[Command]
name = "rig_reset_p1"
command = a
time = 1

[Command]
name = "rig_reset_p2"
command = b
time = 1

[Command]
name = "rig_reset_both"
command = c
time = 1

[Command]
name = "rig_fine"
command = /x
time = 1

[Command]
name = "rig_fast"
command = /y
time = 1

[Command]
name = "rig_lock"
command = z
time = 1

[Command]
name = "rig_sweep"
command = x+y
time = 2

[Command]
name = "rig_preset"
command = a+b
time = 2

[Command]
name = "rig_markers"
command = a+c
time = 2

[Command]
name = "rig_toggle_info"
command = b+c
time = 2

[Command]
name = "rig_toggle_help"
command = y+z
time = 2
`;
}

function rigAir() {
  return `; The Stage Rig is intentionally invisible and contains no authored sprites.
[Begin Action 0]
-1, 0, 0, 0, -1
`;
}

function stageReadout(model, stageLabel) {
  const p1 = model.playerStarts[0], p2 = model.playerStarts[1];
  const camera = model.camera, stage = model.stageInfo;
  return `IKEMAKER STAGE RIG — ${quoted(stageLabel)}\\nP1 world (%v, %v) screen (%v, %v) stage edges B/F (%v, %v)\\nP2 world (%v, %v) screen (%v, %v) stage edges B/F (%v, %v)\\nModes lock %v (0 off/1 X/2 Y/3 both)  sweep %v (0 off/1 X/2 Y/3 both)  preset %v  markers %v\\nStarts P1 ${compact(p1.x)},${compact(p1.y)}  P2 ${compact(p2.x)},${compact(p2.y)}  |  Stage X ${compact(model.movementBounds[0])}..${compact(model.movementBounds[1])}\\nCamera X ${compact(camera.bounds[0])}..${compact(camera.bounds[1])}  Y ${compact(camera.bounds[2])}..${compact(camera.bounds[3])}  |  Screen padding L/R ${compact(model.screenBounds[0])}/${compact(model.screenBounds[1])}\\nZoom ${compact(camera.zoom[1])}..${compact(camera.zoom[2])} (start ${compact(camera.zoom[0])})  |  tension ${compact(camera.tension)}  vertical ${compact(camera.verticalFollow)}  floor ${compact(camera.floorTension)}  zoffset ${compact(stage.zOffset)}`;
}

function stageFooter() {
  return `DIRECTIONS Move P1   D+DIRECTIONS Move P2   W+DIRECTIONS Move both/reversed   X Fine   Y Fast\\nA Reset P1   B Reset P2   C Reset both   A+B Stress preset   X+Y Auto sweep   Z Coordinate lock   A+C Markers\\nB+C Hide/show measurements   Y+Z Hide/show this button guide   PAUSE Pause/resume   SCROLL LOCK Advance frame`;
}

function bgCtrlMonitor(model) {
  if (!model.controllers || !model.controllers.length) return '# No authored BGCtrl blocks were found.';
  const lines = ['# Authored BGCtrl schedule monitor. This estimates schedule windows; it does not claim hidden engine state.'];
  for (const controller of model.controllers.slice(0, 12)) {
    const start = numeric(controller.time[0]), end = numeric(controller.time[1], start), loop = numeric(controller.time[2], -1);
    const label = quoted(`${controller.name}: ${controller.type || 'unspecified'} @ ${compact(start)}..${compact(end)}${loop > 0 ? ` every ${compact(loop)}` : ''}`);
    const condition = loop > 0
      ? `time >= ${compact(start)} && ((time - ${compact(start)}) % ${compact(loop)}) <= ${compact(Math.max(0, end - start))}`
      : `time >= ${compact(start)} && time <= ${compact(end)}`;
    lines.push(`if playerNo = 1 && !map(IKEMaker_Rig_HideInfo) && ${condition} {\n\ttext{removeTime: 1; layerNo: 2; localCoord: screenWidth, screenHeight; text: "BGCTRL ACTIVE: ${label}"; font: -1; align: 1; pos: 8, screenHeight - ${54 + controller.order * 10}; scale: 0.42, 0.42; color: 256, 220, 80, 256}\n}`);
  }
  if (model.controllers.length > 12) lines.push(`# ${model.controllers.length - 12} more BGCtrl blocks remain visible in the Stage Workspace timeline.`);
  return lines.join('\n');
}

function rigStates(model, options = {}) {
  const speed = Math.max(0.1, numeric(options.speed, 2));
  const fineSpeed = Math.max(0.05, numeric(options.fineSpeed, speed / 4));
  const fastSpeed = Math.max(speed, numeric(options.fastSpeed, speed * 4));
  const readout = stageReadout(model, options.stageLabel || model.name || 'Stage');
  const footer = stageFooter();
  const p1 = model.playerStarts[0], p2 = model.playerStarts[1];
  const left = model.movementBounds[0], right = model.movementBounds[1];
  const center = (left + right) / 2, separation = Math.max(40, Math.abs(p2.x - p1.x));
  const high = model.camera.bounds[2], low = model.camera.bounds[3];
  return `# IKEMaker Stage Rig — generated development character.
# P1 owns all input. Runtime maps are private to this generated diagnostic character.

[StateDef 5900; anim: 0;]
changeState{value: 0}

[StateDef 0; type: S; moveType: I; physics: N; anim: 0; ctrl: 0;]
assertSpecial{flag: invisible; flag2: noShadow; flag3: noAutoTurn; flag4: globalNoKO; flag5: roundNotOver}
assertSpecial{flag: noLifeBarDisplay; flag2: noPowerBarDisplay; flag3: noGuardBarDisplay; flag4: noStunBarDisplay; flag5: skipFightDisplay; flag6: skipRoundDisplay}
assertSpecial{flag: noNameDisplay; flag2: noFaceDisplay; flag3: noTimeDisplay; flag4: noWinIconDisplay; flag5: noComboDisplay}
playerPush{value: 0}
notHitBy{value: SCA}
velSet{x: 0; y: 0}

[StateDef -4]
# Edge-triggered modes. Combo actions suppress their single-button actions.
if playerNo = 1 {
	if command = "rig_lock" && !(command = "rig_toggle_help") && !map(IKEMaker_Rig_LockHeld) {
		map(IKEMaker_Rig_LockMode) := (map(IKEMaker_Rig_LockMode) + 1) % 4;
	}
	map(IKEMaker_Rig_LockHeld) := command = "rig_lock";
	if command = "rig_sweep" && !map(IKEMaker_Rig_SweepHeld) {
		map(IKEMaker_Rig_SweepMode) := (map(IKEMaker_Rig_SweepMode) + 1) % 4;
		map(IKEMaker_Rig_SweepDirectionX) := 1;
		map(IKEMaker_Rig_SweepDirectionY) := -1;
	}
	map(IKEMaker_Rig_SweepHeld) := command = "rig_sweep";
	if command = "rig_preset" && !map(IKEMaker_Rig_PresetHeld) {
		map(IKEMaker_Rig_Preset) := (map(IKEMaker_Rig_Preset) + 1) % 5;
		map(IKEMaker_Rig_PresetSerial) := map(IKEMaker_Rig_PresetSerial) + 1;
	}
	map(IKEMaker_Rig_PresetHeld) := command = "rig_preset";
	if command = "rig_markers" && !map(IKEMaker_Rig_MarkersHeld) {
		map(IKEMaker_Rig_Markers) := !map(IKEMaker_Rig_Markers);
	}
	map(IKEMaker_Rig_MarkersHeld) := command = "rig_markers";
	if command = "rig_toggle_info" && !map(IKEMaker_Rig_InfoHeld) {
		map(IKEMaker_Rig_HideInfo) := !map(IKEMaker_Rig_HideInfo);
	}
	map(IKEMaker_Rig_InfoHeld) := command = "rig_toggle_info";
	if command = "rig_toggle_help" && !map(IKEMaker_Rig_HelpHeld) {
		map(IKEMaker_Rig_HideHelp) := !map(IKEMaker_Rig_HideHelp);
	}
	map(IKEMaker_Rig_HelpHeld) := command = "rig_toggle_help";
}

# A, B and C reset the rig actors to the authored stage starts.
if playerNo = 1 && !(command = "rig_preset") && !(command = "rig_markers") && !(command = "rig_toggle_info") {
	if command = "rig_reset_p1" || command = "rig_reset_both" { posSet{x: ${compact(p1.x)}; y: ${compact(p1.y)}} }
}
if playerNo = 2 && playerNoExist(1) && !(player(1), command = "rig_preset") && !(player(1), command = "rig_markers") && !(player(1), command = "rig_toggle_info") {
	if (player(1), command = "rig_reset_p2") || (player(1), command = "rig_reset_both") { posSet{x: ${compact(p2.x)}; y: ${compact(p2.y)}} }
}

# A+B cycles starts, left edge, right edge, maximum split and vertical stress presets.
if playerNo = 1 && map(IKEMaker_Rig_PresetSerial) != map(IKEMaker_Rig_AppliedPresetSerial) {
	map(IKEMaker_Rig_AppliedPresetSerial) := map(IKEMaker_Rig_PresetSerial);
	switch map(IKEMaker_Rig_Preset) {
		case 0: posSet{x: ${compact(p1.x)}; y: ${compact(p1.y)}}
		case 1: posSet{x: ${compact(left + separation)}; y: 0}
		case 2: posSet{x: ${compact(right - separation)}; y: 0}
		case 3: posSet{x: ${compact(left)}; y: 0}
		case 4: posSet{x: ${compact(center - separation / 2)}; y: ${compact(high)}}
	}
}
if playerNo = 2 && playerNoExist(1) && player(1), map(IKEMaker_Rig_PresetSerial) != map(IKEMaker_Rig_AppliedPresetSerial) {
	map(IKEMaker_Rig_AppliedPresetSerial) := player(1), map(IKEMaker_Rig_PresetSerial);
	switch player(1), map(IKEMaker_Rig_Preset) {
		case 0: posSet{x: ${compact(p2.x)}; y: ${compact(p2.y)}}
		case 1: posSet{x: ${compact(left + separation * 2)}; y: 0}
		case 2: posSet{x: ${compact(right)}; y: 0}
		case 3: posSet{x: ${compact(right)}; y: 0}
		case 4: posSet{x: ${compact(center + separation / 2)}; y: ${compact(low)}}
	}
}

# X+Y cycles horizontal, vertical, combined and off automated camera sweeps.
if playerNo = 1 && map(IKEMaker_Rig_SweepMode) > 0 {
	if map(IKEMaker_Rig_SweepMode) = 1 || map(IKEMaker_Rig_SweepMode) = 3 {
		if pos x >= ${compact(right - separation)} { map(IKEMaker_Rig_SweepDirectionX) := -1; }
		if pos x <= ${compact(left)} { map(IKEMaker_Rig_SweepDirectionX) := 1; }
		posAdd{x: ${compact(speed)} * map(IKEMaker_Rig_SweepDirectionX)}
	}
	if map(IKEMaker_Rig_SweepMode) = 2 || map(IKEMaker_Rig_SweepMode) = 3 {
		if pos y <= ${compact(high)} { map(IKEMaker_Rig_SweepDirectionY) := 1; }
		if pos y >= ${compact(low)} { map(IKEMaker_Rig_SweepDirectionY) := -1; }
		posAdd{y: ${compact(speed)} * map(IKEMaker_Rig_SweepDirectionY)}
	}
}

# P1: arrows normally control P1. W keeps P1 active; D reserves input for P2.
if playerNo = 1 && !(command = "rig_p2") && !(command = "rig_sweep") && map(IKEMaker_Rig_SweepMode) = 0 {
	let rigSpeed = cond(command = "rig_fine", ${compact(fineSpeed)}, cond(command = "rig_fast", ${compact(fastSpeed)}, ${compact(speed)}));
	if command = "holdfwd"  { posAdd{x: $rigSpeed} }
	if command = "holdback" { posAdd{x: -$rigSpeed} }
	if command = "holdup"   { posAdd{y: -$rigSpeed} }
	if command = "holddown" { posAdd{y: $rigSpeed} }
}

# P2 reads P1 input. D follows P1's world direction; W deliberately reverses it.
if playerNo = 2 && playerNoExist(1) && player(1), map(IKEMaker_Rig_SweepMode) = 0 {
	let rigSpeed = cond(player(1), command = "rig_fine", ${compact(fineSpeed)}, cond(player(1), command = "rig_fast", ${compact(fastSpeed)}, ${compact(speed)}));
	if player(1), command = "rig_both" {
		if player(1), command = "holdfwd"  { posAdd{x: $rigSpeed} }
		if player(1), command = "holdback" { posAdd{x: -$rigSpeed} }
		if player(1), command = "holdup"   { posAdd{y: $rigSpeed} }
		if player(1), command = "holddown" { posAdd{y: -$rigSpeed} }
	} else if player(1), command = "rig_p2" {
		if player(1), command = "holdfwd"  { posAdd{x: -$rigSpeed} }
		if player(1), command = "holdback" { posAdd{x: $rigSpeed} }
		if player(1), command = "holdup"   { posAdd{y: -$rigSpeed} }
		if player(1), command = "holddown" { posAdd{y: $rigSpeed} }
	}
}

# Z cycles X lock, Y lock, both, and unlocked. Each new lock captures the current offset.
if playerNo = 2 && playerNoExist(1) {
	if player(1), map(IKEMaker_Rig_LockMode) != map(IKEMaker_Rig_AppliedLockMode) {
		map(IKEMaker_Rig_AppliedLockMode) := player(1), map(IKEMaker_Rig_LockMode);
		map(IKEMaker_Rig_LockOffsetX) := pos x - player(1), pos x;
		map(IKEMaker_Rig_LockOffsetY) := pos y - player(1), pos y;
	}
	if player(1), map(IKEMaker_Rig_LockMode) = 1 || player(1), map(IKEMaker_Rig_LockMode) = 3 { posSet{x: player(1), pos x + map(IKEMaker_Rig_LockOffsetX)} }
	if player(1), map(IKEMaker_Rig_LockMode) = 2 || player(1), map(IKEMaker_Rig_LockMode) = 3 { posSet{y: player(1), pos y + map(IKEMaker_Rig_LockOffsetY)} }
}

# Sweep mode keeps P2 opposite P1 so the camera traverses the authored range.
if playerNo = 2 && playerNoExist(1) && player(1), map(IKEMaker_Rig_SweepMode) > 0 {
	if player(1), map(IKEMaker_Rig_SweepMode) = 1 || player(1), map(IKEMaker_Rig_SweepMode) = 3 { posSet{x: ${compact(center * 2)} - player(1), pos x} }
	if player(1), map(IKEMaker_Rig_SweepMode) = 2 || player(1), map(IKEMaker_Rig_SweepMode) = 3 { posSet{y: ${compact(high + low)} - player(1), pos y} }
}
if playerNo = 1 && !map(IKEMaker_Rig_HideInfo) {
	text{
		removeTime: 1;
		layerNo: 2;
		localCoord: screenWidth, screenHeight;
		text: "${readout}";
		params: pos x, pos y, screenPos x, screenPos y, stageBackEdgeDist, stageFrontEdgeDist,
			player(2), pos x, player(2), pos y, player(2), screenPos x, player(2), screenPos y,
			player(2), stageBackEdgeDist, player(2), stageFrontEdgeDist,
			map(IKEMaker_Rig_LockMode), map(IKEMaker_Rig_SweepMode), map(IKEMaker_Rig_Preset), map(IKEMaker_Rig_Markers);
		font: -1;
		align: 1;
		pos: 8, 8;
		scale: 0.5, 0.5;
		color: 256, 256, 256, 256;
	}
}
if playerNo = 1 && !map(IKEMaker_Rig_HideHelp) {
	text{
		removeTime: 1;
		layerNo: 2;
		localCoord: screenWidth, screenHeight;
		text: "${footer}";
		font: -1;
		align: 1;
		pos: 8, screenHeight - 30;
		scale: 0.42, 0.42;
		color: 220, 236, 256, 256;
	}
}
if (playerNo = 1 && map(IKEMaker_Rig_Markers)) || (playerNo = 2 && playerNoExist(1) && player(1), map(IKEMaker_Rig_Markers)) {
	text{removeTime: 1; layerNo: 2; localCoord: screenWidth, screenHeight; text: "P%v +"; params: playerNo; font: -1; align: 0; pos: screenPos x, screenPos y; scale: 0.55, 0.55; color: cond(playerNo = 1, 80, 256), 220, cond(playerNo = 1, 256, 80), 256}
}

${bgCtrlMonitor(model)}
`;
}

function rigDefinition(model, commonFile = 'common1.cns.zss') {
  const local = model.localCoord || [320, 240];
  return `; Generated by IKEMaker. Development-only; never add this character to select.def.
[Info]
name = "IKEMaker Stage Rig"
displayname = "IKEMaker Stage Rig"
versiondate = 09,06,2026
mugenversion = 1.0
ikemenversion = 1.0
author = "IKEMaker"
localcoord = ${compact(local[0])}, ${compact(local[1])}

[Files]
cmd = IKEMaker_Stage_Rig.cmd
cns = IKEMaker_Stage_Rig.const
st = IKEMaker_Stage_Rig.zss
stcommon = ${commonFile}
sprite = IKEMaker_Stage_Rig.sff
anim = IKEMaker_Stage_Rig.air
sound = IKEMaker_Stage_Rig.snd
`;
}

function rigReadme(model) {
  return `IKEMaker Stage Rig
======================

This folder is generated for stage development and may be replaced whenever a stage test launches.
It must not be added to select.def, shipped in a public build, or used as a gameplay dependency.

Controls
--------
- Directions: move P1.
- Hold D + directions: move only P2.
- Hold W + directions: move both; P2 moves in the opposite direction.
- Hold X while moving: fine adjustment. Hold Y: fast adjustment.
- A / B / C: reset P1 / P2 / both to the stage's authored starts.
- A+B: cycle camera-stress presets (starts, left, right, maximum split, vertical).
- X+Y: cycle automated horizontal, vertical, combined, and off sweeps.
- Z: cycle coordinate locking (off, X, Y, both).
- A+C: toggle P1/P2 screen markers.
- IKEMEN's native Pause key pauses/resumes; Scroll Lock advances one frame while paused.

The in-game overlay reports runtime positions and modes, stage-edge distances, authored camera values,
and an estimated BGCtrl schedule. The Stage Workspace remains authoritative for the complete timeline.

Current authored stage: ${model.name}
`;
}

function buildStageRigPlan(root, model, stageFilename, options = {}) {
  const directory = path.join(root, 'chars', RIG_DIRECTORY);
  const stem = path.join(directory, 'IKEMaker_Stage_Rig');
  const stageLabel = path.relative(root, stageFilename).replace(/\\/g, '/');
  return {
    directory,
    character: `chars/${RIG_DIRECTORY}/${RIG_DEF}`,
    writes: [
      [`${stem}.def`, rigDefinition(model, ['common1.cns.zss', 'common1.cns'].find(file => fs.existsSync(path.join(root, 'data', file))) || 'common1.cns.zss')],
      [`${stem}.const`, rigConstants()],
      [`${stem}.cmd`, rigCommands()],
      [`${stem}.air`, rigAir()],
      [`${stem}.zss`, rigStates(model, { speed: options.speed, fineSpeed: options.fineSpeed, fastSpeed: options.fastSpeed, stageLabel })],
      [`${stem}.sff`, blankSff()],
      [`${stem}.snd`, blankSnd()],
      [path.join(directory, 'README.txt'), rigReadme(model)]
    ]
  };
}

function installStageRig(root, model, stageFilename, options = {}) {
  const plan = buildStageRigPlan(root, model, stageFilename, options);
  transactionalWriteSet(fs, plan.writes, { label: 'generate-stage-rig', journalRoot: root, backup: false, journal: false, allowExisting: true });
  return plan;
}

function stageRoot(filename) {
  let current = path.dirname(path.resolve(filename));
  while (true) {
    const hasChars = fs.existsSync(path.join(current, 'chars'));
    const hasGameData = fs.existsSync(path.join(current, 'data', 'select.def'))
      || fs.existsSync(path.join(current, 'data', 'system.def'))
      || fs.existsSync(path.join(current, 'data', 'system.base.def'));
    if ((hasChars && hasGameData)
      || fs.existsSync(path.join(current, 'Ikemen_GO.exe'))
      || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

function hostCapabilities() {
  return detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
}

async function launchStageRig(stageUri, options = {}) {
  const capabilities = hostCapabilities();
  if (!capabilities.ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMaker Stage Rig launch', capabilities));
  let filename = stageUri && stageUri.fsPath;
  if (!filename) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) filename = active.fsPath;
  }
  if (!filename) {
    filename = await require('./open_target_picker').chooseFileOrFolder({ title: 'Choose Stage for IKEMaker Stage Rig', filters: { 'IKEMEN stage': ['def'] }, extensions: ['def'], predicate: (candidate) => { try { return kind(parseDef(fs.readFileSync(candidate, 'utf8'), candidate)) === 'stage'; } catch (_) { return false; } }, maxDepth: 4, invalidMessage: 'That DEF is not an IKEMEN stage.', emptyMessage: 'No stage DEF files were found in that folder.' });
  }
  if (!filename) return;
  let model;
  try {
    const document = parseDef(fs.readFileSync(filename, 'utf8'), filename);
    if (kind(document) !== 'stage') throw new Error('The chosen DEF is not an IKEMEN stage.');
    model = stageModel(document);
  } catch (error) { return vscode.window.showErrorMessage(`Could not prepare Stage Rig: ${error.message}`); }
  const root = stageRoot(filename);
  if (!root) return vscode.window.showErrorMessage('Could not locate the IKEMEN game containing this stage.');
  try {
    const config = vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(filename));
    const speed = numeric(options.speed, config.get('stageRigMoveSpeed', 2));
    const fineSpeed = numeric(options.fineSpeed, config.get('stageRigFineMoveSpeed', Math.max(0.05, speed / 4)));
    const fastSpeed = numeric(options.fastSpeed, config.get('stageRigFastMoveSpeed', speed * 4));
    const plan = installStageRig(root, model, filename, { speed, fineSpeed, fastSpeed });
    const configured = vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(filename)).get('ikemenPath', '');
    const executable = require('./engine_runtime').resolve(root, configured, filename);
    if (!fs.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
    const stage = path.relative(root, filename).replace(/\\/g, '/');
    const args = ['-loadmotif', '-time', '-1', '-rounds', '-1', '-tmode1', '0', '-tmode2', '0', '-s', stage, '-p1', plan.character, '-p2', plan.character];
    const child = spawn(executable, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    vscode.window.showInformationMessage(`IKEMaker Stage Rig launched for ${model.name}. Directions move P1; hold D for P2; hold W for both in opposite directions.`);
  } catch (error) { vscode.window.showErrorMessage(`Could not launch Stage Rig: ${error.message}`); }
}

module.exports = {
  RIG_DIRECTORY, RIG_DEF, rigConstants, rigCommands, rigAir, rigDefinition, rigStates,
  stageReadout, stageFooter, bgCtrlMonitor, buildStageRigPlan, installStageRig, stageRoot, launchStageRig
};
