'use strict';

const def = require('./def_model');
const { appendSection, duplicateSection, deleteSection } = require('./visual_def_authoring');

const TYPES = Object.freeze({
  opening: { label: 'Character opening / intro', stem: 'intro' },
  ending: { label: 'Character ending', stem: 'ending' },
  credits: { label: 'Credits', stem: 'credits' },
  gameintro: { label: 'Game opening', stem: 'intro' },
  logo: { label: 'Logo sequence', stem: 'logo' },
  gameover: { label: 'Game over', stem: 'gameover' },
  loading: { label: 'Pre-match loading (VS screen disabled)', stem: 'loading' },
  interstitial: { label: 'Between-fight story scene', stem: 'story_scene' }
});

function storyboardTemplate(type = 'opening', name = 'New Storyboard', sff = 'storyboard.sff', options = {}) {
  const kind = TYPES[type] ? type : 'opening', credits = kind === 'credits';
  const coordinates = Array.isArray(options.localCoord) ? options.localCoord : [320, 240];
  const width = Math.max(1, Math.trunc(Number(coordinates[0])) || 320), height = Math.max(1, Math.trunc(Number(coordinates[1])) || 240);
  const duration = Math.max(1, Math.trunc(Number(options.duration)) || (credits ? 600 : 180));
  const safeName = String(name || 'New Storyboard').replace(/[\r\n"]/g, ' ').trim(), author = String(options.author || '').replace(/[\r\n"]/g, ' ').trim();
  return `; IKEMEN 1.0 ${TYPES[kind].label}\n[Info]\nname = "${safeName}"\nauthor = "${author}"\nlocalcoord = ${width},${height}\n\n[SceneDef]\nspr = ${sff}\nstartscene = 0\nkey.skip = s\nkey.cancel = a, b, c, x, y, z, m\nstopmusic = 1\n\n[Scene 0]\n; ${safeName}\nfadein.time = 15\nfadein.col = 0,0,0\nfadeout.time = 15\nfadeout.col = 0,0,0\nclearcolor = 0,0,0\nlayer0.offset = ${Math.round(width / 2)},${Math.round(height / 2)}\nlayer0.${credits ? 'font' : 'spr'} = ${credits ? '0,0,0' : '0,0'}\n${credits ? 'layer0.text = Credits' : ''}\nlayer0.starttime = 0\nend.time = ${duration}\n`;
}
// IKEMEN's INI loader accepts triple-quoted literal values without treating
// semicolons, hashes, quotes, or trailing backslashes as syntax.
function layerTextValue(document, entry) {
  const raw = String(document.lines[entry.line] || '');
  const value = raw.slice(raw.indexOf('=') + 1).trim();
  if (value.startsWith('"""') && value.lastIndexOf('"""') >= 3) return value.slice(3, value.lastIndexOf('"""'));
  return def.unquote(entry.value);
}
function storyboardModel(document) {
  const info = def.sections(document, 'Info')[0] || { entries: [] }, sceneDef = def.sections(document, 'SceneDef')[0] || { entries: [] };
  const im = def.sectionMap(info), dm = def.sectionMap(sceneDef);
  const scenes = document.sections.filter((section) => /^scene\s+\d+$/i.test(section.name)).map((section) => {
    const map = def.sectionMap(section), layers = new Map();
    for (const entry of section.entries) {
      const match = /^layer(\d+)\.(.+)$/i.exec(entry.normalized); if (!match) continue;
      const index = Number(match[1]); if (!layers.has(index)) layers.set(index, { index, properties: {}, lines: {} });
      layers.get(index).properties[match[2]] = match[2] === 'text' ? layerTextValue(document, entry) : entry.value; layers.get(index).lines[match[2]] = entry.line;
    }
    return { name: section.name, number: Number(section.name.match(/\d+/)[0]), line: section.line, endTime: def.number(map['end.time'], 180), clearColor: def.tuple(map.clearcolor, 3), bgm: def.unquote(map.bgm), layers: [...layers.values()].sort((left,right)=>left.index-right.index).map((layer) => ({ ...layer, position: def.tuple(layer.properties.offset || '0,0').map((value, axis) => value + def.tuple(map['layerall.pos'] || '0,0')[axis]), sprite: layer.properties.spr ? def.integerTuple(layer.properties.spr) : null, animation: layer.properties.anim ? Math.trunc(def.number(layer.properties.anim)) : null, font: layer.properties.font || '', text: layer.properties.text || '' })) };
  });
  return { localCoord: def.tuple(im.localcoord || '320,240'), infoLine: info.line, sceneDefLine: sceneDef.line, sff: def.unquote(dm.spr), snd: def.unquote(dm.snd), font: def.unquote(dm.font), startScene: Math.trunc(def.number(dm.startscene, 0)), scenes, source: document };
}
function validateStoryboard(model) {
  const issues=[];
  if(!model.sff)issues.push({severity:'error',code:'missing-sff',message:'SceneDef does not assign a storyboard SFF.'});
  if(model.localCoord.some(value=>!Number.isFinite(value)||value<=0))issues.push({severity:'error',code:'localcoord',line:model.infoLine,message:'Storyboard localcoord must contain two positive values.',repair:model.infoLine==null?null:{sectionLine:model.infoLine,key:'localcoord',value:'320,240',label:'Use 320,240'}});
  if(!model.scenes.length)issues.push({severity:'error',code:'missing-scenes',message:'The storyboard has no numbered Scene sections.'});
  else if(!model.scenes.some(scene=>scene.number===model.startScene))issues.push({severity:'error',code:'start-scene',line:model.sceneDefLine,message:`Start scene ${model.startScene} does not exist.`,repair:model.sceneDefLine==null?null:{sectionLine:model.sceneDefLine,key:'startscene',value:String(model.scenes[0].number),label:`Start at Scene ${model.scenes[0].number}`}});
  const seen=new Set();
  for(const scene of model.scenes){
    if(seen.has(scene.number))issues.push({severity:'error',code:'duplicate-scene',line:scene.line,message:`Scene ${scene.number} is defined more than once.`});seen.add(scene.number);
    if(!Number.isFinite(scene.endTime)||scene.endTime<1)issues.push({severity:'error',code:'scene-duration',line:scene.line,message:`Scene ${scene.number} must have a positive end.time.`,repair:{sectionLine:scene.line,key:'end.time',value:'180',label:'Use 180 ticks'}});
    if(!scene.layers.length)issues.push({severity:'warning',code:'empty-scene',line:scene.line,message:`Scene ${scene.number} has no visual layers.`});
    for(const layer of scene.layers){
      if(!layer.sprite&&layer.animation===null&&!layer.font&&!layer.text)issues.push({severity:'warning',code:'empty-layer',line:scene.line,message:`Scene ${scene.number}, layer ${layer.index} has no sprite, animation, font, or text source.`});
      if(layer.position[0]<0||layer.position[1]<0||layer.position[0]>model.localCoord[0]||layer.position[1]>model.localCoord[1])issues.push({severity:'info',code:'off-canvas-layer',line:scene.line,message:`Scene ${scene.number}, layer ${layer.index} starts outside the ${model.localCoord.join('×')} canvas. This can be intentional for motion.`});
    }
  }
  return issues.map(issue=>issue.repair?{...issue,repair:Object.freeze({...issue.repair})}:issue);
}
function appendScene(text, number) { return appendSection(text, `Scene ${number}`, { clearcolor: '0,0,0', 'fadein.time': 15, 'fadeout.time': 15, 'layer0.offset': '160,120', 'layer0.spr': '0,0', 'layer0.starttime': 0, 'end.time': 180 }); }
function duplicateScene(text, line, number) { return duplicateSection(text, line, `Scene ${number}`); }
function deleteScene(text, line) { return deleteSection(text, line); }
function appendLayer(text, sceneLine, options = {}) {
  const document = def.parseDef(text), section = document.sections.find((item) => item.line === Number(sceneLine));
  if (!section || !/^scene\s+\d+$/i.test(section.name)) throw new Error('The selected storyboard scene no longer exists.');
  const index = Math.max(0, Math.trunc(Number(options.index) || 0)), prefix = `layer${index}.`;
  if (section.entries.some((entry) => entry.normalized.startsWith(prefix))) throw new Error(`Layer ${index} already exists in [${section.name}].`);
  const kind = options.kind || 'sprite', lines = [`${prefix}offset = ${options.pos || '160,120'}`];
  if (kind === 'animation') lines.push(`${prefix}anim = ${Number(options.reference) || 0}`);
  else if (kind === 'text') { lines.push(`${prefix}font = ${options.font || '0,0,0'}`); const text = String(options.text ?? 'New text'); if (/[\r\n]/.test(text)) throw new Error('Enter one line of storyboard text.'); lines.push(`${prefix}text = """${text}"""`); const coord = storyboardModel(document).localCoord; lines.push(`${prefix}textwindow = 0,0,${coord.join(',')}`); }
  else lines.push(`${prefix}spr = ${options.reference || '0,0'}`);
  lines.push(`${prefix}starttime = ${Math.max(0, Number(options.startTime) || 0)}`, '');
  const next = document.sections.find((item) => item.line > section.line), at = next ? next.line : document.lines.length, output = [...document.lines]; output.splice(at, 0, ...lines);
  return output.join(document.text.includes('\r\n') ? '\r\n' : '\n');
}

module.exports = { TYPES, storyboardTemplate, storyboardModel, validateStoryboard, appendScene, duplicateScene, deleteScene, appendLayer };
