'use strict';

const def = require('./def_model');

function one(document, name) { return def.sections(document, name)[0] || { entries: [] }; }
function optionalNumber(section, key) { const found = def.entry(section, key); return found ? def.number(found.value) : null; }

function background(section, order) {
  const map = def.sectionMap(section);
  const sprite = def.entry(section, 'spriteno');
  const action = def.entry(section, 'actionno');
  return {
    order,
    name: section.name.replace(/^bg\s*/i, '').trim() || `Background ${order + 1}`,
    line: section.line,
    type: def.normalize(map.type || (action ? 'anim' : 'normal')),
    id: optionalNumber(section, 'id'),
    sctrlid: optionalNumber(section, 'sctrlid'),
    layer: def.number(map.layerno, 0),
    sprite: sprite ? def.integerTuple(sprite.value) : null,
    action: action ? Math.trunc(def.number(action.value)) : null,
    start: def.tuple(map.start),
    delta: def.tuple(map.delta || '1,1', 2, 1),
    velocity: def.tuple(map.velocity),
    tile: def.integerTuple(map.tile),
    tileSpacing: def.tuple(map.tilespacing),
    scaleStart: def.tuple(map.scalestart || '1,1', 2, 1),
    scaleDelta: def.tuple(map.scaledelta),
    zoomDelta: def.tuple(map.zoomdelta || '1,1', 2, 1),
    zoomScaleDelta: def.tuple(map.zoomscaledelta),
    xscale: def.entry(section, 'xscale') ? def.tuple(map.xscale, 2, 1) : null,
    width: def.entry(section, 'width') ? def.tuple(map.width) : null,
    yScaleStart: def.number(map.yscalestart, 100),
    yScaleDelta: def.number(map.yscaledelta, 0),
    window: def.entry(section, 'window') ? def.tuple(map.window, 4) : null,
    windowDelta: def.tuple(map.windowdelta),
    maskWindow: def.entry(section, 'maskwindow') ? def.tuple(map.maskwindow, 4) : null,
    trans: def.normalize(map.trans || 'none'),
    alpha: def.tuple(map.alpha || '256,0'),
    mask: def.number(map.mask, 0),
    angle: def.number(map.angle, 0),
    xAngle: def.number(map.xangle, 0),
    yAngle: def.number(map.yangle, 0),
    projection: def.normalize(map.projection || 'orthographic'),
    focalLength: def.number(map.focallength, 0),
    xShear: def.number(map.xshear, 0),
    autoResizeParallax: def.number(map.autoresizeparallax, 0) !== 0,
    xBottomZoomDelta: optionalNumber(section, 'xbottomzoomdelta'),
    roundPos: optionalNumber(section, 'roundpos'),
    raw: map
  };
}

function stageModel(document) {
  const info = one(document, 'Info');
  const cameraSection = one(document, 'Camera');
  const playerSection = one(document, 'PlayerInfo');
  const boundSection = one(document, 'Bound');
  const stageSection = one(document, 'StageInfo');
  const bgDef = one(document, 'BGDef');
  const infoMap = def.sectionMap(info), camera = def.sectionMap(cameraSection), players = def.sectionMap(playerSection);
  const stage = def.sectionMap(stageSection), bound = def.sectionMap(boundSection), bg = def.sectionMap(bgDef);
  const localCoord = def.tuple(stage.localcoord || '320,240', 2, 0);
  const backgrounds = document.sections.filter((section) => /^bg(?:\s+.+)?$/i.test(section.name) && section.normalized !== 'bg').map(background);
  const controllers = document.sections.filter((section) => /^bgctrl(?:\s+.+)?$/i.test(section.name)).map((section, order) => {
    const map = def.sectionMap(section);
    return { order, name: section.name.replace(/^bgctrl\s*/i, '').trim() || `Controller ${order + 1}`, line: section.line, type: def.normalize(map.type), sctrlid: optionalNumber(section, 'sctrlid'), ctrlid: def.entry(section, 'ctrlid') ? def.integerTuple(map.ctrlid, String(map.ctrlid).split(',').length) : [], time: def.tuple(map.time, 3), value: map.value || '', x: optionalNumber(section, 'x'), y: optionalNumber(section, 'y'), raw: map };
  });
  const attachedChars = [];
  for (let index = 0; index <= 4; index += 1) {
    const key = index === 0 ? 'attachedchar' : `attachedchar${index}`;
    if (infoMap[key]) attachedChars.push({ slot: index || 1, path: def.unquote(infoMap[key]) });
  }
  const roundDefs = Object.entries(infoMap).filter(([key]) => /^round\d+def$/.test(key)).map(([key, path]) => ({ round: Number(key.match(/\d+/)[0]), path: def.unquote(path) }));
  const starts = [];
  for (let index = 1; index <= 8; index += 1) starts.push({
    player: index,
    x: def.number(players[`p${index}startx`], index % 2 ? -70 : 70),
    y: def.number(players[`p${index}starty`], 0),
    z: def.number(players[`p${index}startz`], 0),
    facing: def.number(players[`p${index}facing`], index % 2 ? 1 : -1)
  });
  return {
    kind: 'stage',
    name: def.unquote(infoMap.displayname || infoMap.name || 'Untitled stage'),
    author: def.unquote(infoMap.author),
    localCoord,
    sff: def.unquote(bg.spr),
    model: def.unquote(bg.model),
    sceneNumber: def.number(bg.scenenumber, 0),
    camera: {
      start: [def.number(camera.startx), def.number(camera.starty)],
      bounds: [def.number(camera.boundleft, -160), def.number(camera.boundright, 160), def.number(camera.boundhigh, -25), def.number(camera.boundlow, 0)],
      tension: def.number(camera.tension, 50),
      tensionHigh: optionalNumber(cameraSection, 'tensionhigh'), tensionLow: optionalNumber(cameraSection, 'tensionlow'),
      verticalFollow: def.number(camera.verticalfollow, 0.2), floorTension: def.number(camera.floortension, 0),
      zoom: [def.number(camera.startzoom, 1), def.number(camera.zoomout, 1), def.number(camera.zoomin, 1)],
      autoZoom: def.number(camera.autozoom, 0) !== 0,
      autoCenter: def.number(camera.autocenter, 0) !== 0,
      zoomAnchor: def.normalize(camera.zoomanchor || 'center'),
      boundHighZoomDelta: optionalNumber(cameraSection, 'boundhighzoomdelta')
    },
    stageInfo: { zOffset: def.number(stage.zoffset, localCoord[1] - 20), autoTurn: def.number(stage.autoturn, 1) !== 0, resetBg: def.number(stage.resetbg, 1) !== 0, xScale: def.number(stage.xscale, 1), yScale: def.number(stage.yscale, 1) },
    movementBounds: [def.number(players.leftbound, -1000), def.number(players.rightbound, 1000)],
    screenBounds: [def.number(bound.screenleft, 15), def.number(bound.screenright, 15)],
    playerStarts: starts,
    backgrounds,
    controllers,
    attachedChars,
    roundDefs,
    constants: def.sectionMap(one(document, 'Constants')),
    music: def.sectionMap(one(document, 'Music')),
    source: document
  };
}

function parallaxDimensions(item, spriteWidth) {
  if (!item || item.type !== 'parallax') return null;
  const source = Math.max(1, Number(spriteWidth) || 1);
  if (item.width) return { top: Math.abs(item.width[0]), bottom: Math.abs(item.width[1]), source, mode: 'width' };
  if (item.xscale) return { top: source * Math.abs(item.xscale[0]), bottom: source * Math.abs(item.xscale[1]), source, mode: 'xscale' };
  return { top: source, bottom: source, source, mode: 'implicit' };
}

function validateStage(model, archive = null) {
  const issues = [];
  if (!model.sff && !model.model) issues.push({ severity: 'error', code: 'missing-art', message: 'BGDef has neither a sprite archive nor a 3D model.' });
  if (model.camera.bounds[0] > model.camera.bounds[1]) issues.push({ severity: 'error', code: 'camera-x-bounds', message: 'Camera boundleft is greater than boundright.' });
  if (model.camera.bounds[2] > model.camera.bounds[3]) issues.push({ severity: 'warning', code: 'camera-y-bounds', message: 'Camera boundhigh is normally less than or equal to boundlow.' });
  if (model.attachedChars.length > 4) issues.push({ severity: 'error', code: 'attached-count', message: 'IKEMEN supports at most four attached characters.' });
  const ids = new Map();
  for (const item of model.backgrounds) {
    if (item.id !== null) ids.set(item.id, (ids.get(item.id) || 0) + 1);
    if (item.layer < -1 || item.layer > 1) issues.push({ severity: 'warning', code: 'stage-layer', line: item.line, message: `${item.name} uses stage layer ${item.layer}; expected -1, 0, or 1.` });
    if (item.type === 'parallax' && !item.width && !item.xscale) issues.push({ severity: 'warning', code: 'parallax-shape', line: item.line, message: `${item.name} is parallax but defines neither width nor xscale.` });
    if (archive && item.sprite && item.sprite[0] >= 0 && item.sprite[1] >= 0 && !archive.sprites.some((sprite) => sprite.group === item.sprite[0] && sprite.number === item.sprite[1])) issues.push({ severity: 'error', code: 'missing-sprite', line: item.line, message: `${item.name} references missing sprite ${item.sprite.join(',')}.` });
  }
  for (const [id, count] of ids) if (count > 1) issues.push({ severity: 'info', code: 'shared-bg-id', message: `Background ID ${id} is shared by ${count} elements. This is valid, but edits may affect all matching elements.` });
  if (model.attachedChars.length && !model.backgrounds.some((item) => item.id !== null) && !model.controllers.some((item) => item.sctrlid !== null)) issues.push({ severity: 'info', code: 'interaction-ids', message: 'The stage has attached code but no BG id or BGCtrl sctrlid values to target.' });
  return issues;
}

module.exports = { stageModel, background, parallaxDimensions, validateStage };
