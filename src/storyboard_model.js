'use strict';

const def = require('./def_model');
const { appendSection, duplicateSection, deleteSection } = require('./visual_def_authoring');

const TYPES = Object.freeze({
  opening: { label: 'Character opening / intro', stem: 'intro' },
  ending: { label: 'Character ending', stem: 'ending' },
  defaultending: { label: 'Default ending', stem: 'default_ending' },
  credits: { label: 'Credits', stem: 'credits' },
  gameintro: { label: 'Game opening', stem: 'intro' },
  logo: { label: 'Logo sequence', stem: 'logo' },
  gameover: { label: 'Game over', stem: 'gameover' },
  loading: { label: 'Pre-match loading (VS screen disabled)', stem: 'loading' },
  bootloading: { label: 'Boot loading', stem: 'boot_loading' },
  interstitial: { label: 'Between-fight story scene', stem: 'story_scene' }
});

function storyboardTemplate(type = 'opening', name = 'New Storyboard', sff = 'storyboard.sff', options = {}) {
  const kind = TYPES[type] ? type : 'opening', credits = kind === 'credits', bootLoading=kind==='bootloading';
  const coordinates = Array.isArray(options.localCoord) ? options.localCoord : [320, 240];
  const width = Math.max(1, Math.trunc(Number(coordinates[0])) || 320), height = Math.max(1, Math.trunc(Number(coordinates[1])) || 240);
  const duration = Math.max(1, Math.trunc(Number(options.duration)) || (credits ? 600 : 180));
  const safeName = String(name || 'New Storyboard').replace(/[\r\n"]/g, ' ').trim(), author = String(options.author || '').replace(/[\r\n"]/g, ' ').trim();
  return `; IKEMEN 1.0 ${TYPES[kind].label}\n[Info]\nname = "${safeName}"\nauthor = "${author}"\nlocalcoord = ${width},${height}\n\n[SceneDef]\nspr = ${sff}\n${credits ? 'font0 = ikemen1/fonts/Menu1.def\n' : ''}startscene = 0\nkey.skip = s\nkey.cancel = a, b, c, x, y, z, m\nstopmusic = 1\n${bootLoading?'waitforloading = 1\n':''}\n[Scene 0]\n; ${safeName}\nfadein.time = 15\nfadein.col = 0,0,0\nfadeout.time = 15\nfadeout.col = 0,0,0\nclearcolor = 0,0,0\nlayer0.offset = ${Math.round(width / 2)},${Math.round(height / 2)}\nlayer0.${credits ? 'font' : 'spr'} = ${credits ? '0,0,0' : '0,0'}\n${credits ? 'layer0.text = Credits' : ''}\nlayer0.starttime = 0\nend.time = ${duration}\n`;
}
// IKEMEN's INI loader accepts triple-quoted literal values without treating
// semicolons, hashes, quotes, or trailing backslashes as syntax.
function layerTextValue(document, entry) {
  const raw = String(document.lines[entry.line] || '');
  const value = raw.slice(raw.indexOf('=') + 1).trim();
  if (value.startsWith('"""') && value.lastIndexOf('"""') >= 3) return value.slice(3, value.lastIndexOf('"""'));
  return def.unquote(entry.value);
}
function firstEntries(section){const map={};for(const entry of section.entries||[])if(!Object.prototype.hasOwnProperty.call(map,entry.normalized))map[entry.normalized]=entry.value;return map;}
function storyboardModel(document) {
  const info = def.sections(document, 'Info')[0] || { entries: [] }, sceneDef = def.sections(document, 'SceneDef')[0] || { entries: [] };
  const im = firstEntries(info), dm = firstEntries(sceneDef);
  const carry = { clearcolor: '-1,0,0', clearalpha: '255,0', clearlayerno: '0', 'layerall.pos': '0,0' }, carryFrom = { clearcolor: null, clearalpha: null, clearlayerno: null, 'layerall.pos': null };
  const scenes = document.sections.filter((section) => /^scene(?:\s+.+)?$/i.test(section.name)).map((section,ordinal) => {
    const map = firstEntries(section), layers = new Map(), sounds = new Map();
    const inherited = {};
    for (const key of Object.keys(carry)) {
      if (Object.prototype.hasOwnProperty.call(map,key)) { carry[key]=map[key]; carryFrom[key]=section.name; }
      else inherited[key]=carryFrom[key];
    }
    for (const entry of section.entries) {
      const match = /^(layer_?(\d+))\.(.+)$/i.exec(entry.normalized); if (!match) continue;
      const index = Number(match[2]); if (!layers.has(index)) layers.set(index, { index, prefix:match[1], spellings:[match[1]], properties: {}, lines: {} });
      if(!layers.get(index).spellings.includes(match[1]))layers.get(index).spellings.push(match[1]);
      if(!Object.prototype.hasOwnProperty.call(layers.get(index).properties,match[3])){layers.get(index).properties[match[3]] = match[3] === 'text' ? layerTextValue(document, entry) : entry.value; layers.get(index).lines[match[3]] = entry.line;}
    }
    for(const entry of section.entries){const match=/^(sound_?(\d+))\.(.+)$/i.exec(entry.normalized);if(!match)continue;const index=Number(match[2]);if(!sounds.has(index))sounds.set(index,{index,prefix:match[1],spellings:[match[1]],properties:{},lines:{}});if(!sounds.get(index).spellings.includes(match[1]))sounds.get(index).spellings.push(match[1]);if(!Object.prototype.hasOwnProperty.call(sounds.get(index).properties,match[3])){sounds.get(index).properties[match[3]]=entry.value;sounds.get(index).lines[match[3]]=entry.line;}}
    const numbered=/^scene\s+(\d+)$/i.exec(section.name);
    return { name: section.name, key:section.normalized, ordinal, number:numbered?Number(numbered[1]):null, line: section.line, jump:map.jump===undefined?null:Math.trunc(def.number(map.jump,-1)), endTime: def.number(map['end.time'], 0), endTimeOwn:map['end.time']!==undefined, clearColor: def.tuple(carry.clearcolor, 3), clearAlpha:carry.clearalpha, clearLayerNo:carry.clearlayerno, layerAllPosition:def.tuple(carry['layerall.pos']), inherited, fadeInTime:def.number(map['fadein.time'],0), fadeOutTime:def.number(map['fadeout.time'],0), fadeInColor:def.tuple(map['fadein.col']||'0,0,0',3), fadeOutColor:def.tuple(map['fadeout.col']||'0,0,0',3), fadeInAnim:def.number(map['fadein.anim'],-1), fadeOutAnim:def.number(map['fadeout.anim'],-1), fadeInSnd:def.integerTuple(map['fadein.snd']||'-1,0'), fadeOutSnd:def.integerTuple(map['fadeout.snd']||'-1,0'), bgm: def.unquote(map.bgm), bgmOwn:Object.prototype.hasOwnProperty.call(map,'bgm'), sounds:[...sounds.values()].sort((a,b)=>a.index-b.index).map(sound=>({...sound,value:def.integerTuple(sound.properties.value||'-1,0'),startTime:def.number(sound.properties.starttime,0),volumeScale:def.number(sound.properties.volumescale,100),pan:def.number(sound.properties.pan,0)})), layers: [...layers.values()].sort((left,right)=>left.index-right.index).map((layer) => ({ ...layer, position: def.tuple(layer.properties.offset || '0,0').map((value, axis) => value + def.tuple(carry['layerall.pos'])[axis]), sprite: layer.properties.spr ? def.integerTuple(layer.properties.spr) : null, animation: layer.properties.anim ? Math.trunc(def.number(layer.properties.anim)) : null, font: layer.properties.font || '', text: layer.properties.text || '', textDelay:def.number(layer.properties.textdelay,2), facing:def.number(layer.properties.facing,1), scale:def.tuple(layer.properties.scale||'1,1'), angle:def.number(layer.properties.angle,0), layerNo:def.number(layer.properties.layerno,2), startTime:def.number(layer.properties.starttime,0), endTime:layer.properties.endtime===undefined?null:def.number(layer.properties.endtime) })) };
  });
  return { localCoord: def.tuple(im.localcoord || '320,240'), infoLine: info.line, sceneDefLine: sceneDef.line, sff: def.unquote(dm.spr), snd: def.unquote(dm.snd), fonts:Object.fromEntries(Object.entries(dm).filter(([key])=>/^font\d+$/.test(key)).map(([key,value])=>[key,def.unquote(value)])), startScene: Math.trunc(def.number(dm.startscene, 0)), scenes, source: document };
}
function validateStoryboard(model) {
  const issues=[];
  const sceneDef=def.sections(model.source||{sections:[]},'SceneDef')[0],waitForLoading=def.number(firstEntries(sceneDef||{entries:[]}).waitforloading,0)!==0;
  if(model.source?.filename)for(const [slot,declared] of Object.entries(model.fonts||{}))if(declared&&!require('./storyboard_resource_path').resolveStoryboardResource(model.source.filename,declared,'font').available)issues.push({severity:'warning',code:'missing-font-resource',line:model.sceneDefLine,message:`SceneDef ${slot} assigns ${declared}, but that font file was not found beside the storyboard or in the game/data/font search roots. Choose an available font in Storyboard settings before game playback.`});
  for(const section of model.source?.sections||[]){if(section.normalized!=='scenedef'&&!/^scene(?:\s+.+)?$/i.test(section.name))continue;const first=new Map();for(const entry of section.entries){if(first.has(entry.normalized))issues.push({severity:'error',code:'duplicate-key',line:entry.line,message:`[${section.name}] ${entry.normalized} appears at lines ${first.get(entry.normalized)+1} and ${entry.line+1}; IKEMEN uses the first value. Remove the duplicate in text before visual editing.`});else first.set(entry.normalized,entry.line);}}
  if(!model.sff)issues.push({severity:'error',code:'missing-sff',message:'SceneDef does not assign a storyboard SFF.'});
  if(model.localCoord.some(value=>!Number.isFinite(value)||value<=0))issues.push({severity:'error',code:'localcoord',line:model.infoLine,message:'Storyboard localcoord must contain two positive values.',repair:model.infoLine==null?null:{sectionLine:model.infoLine,key:'localcoord',value:'320,240',label:'Use 320,240'}});
  if(!model.scenes.length)issues.push({severity:'error',code:'missing-scenes',message:'The storyboard has no Scene sections.'});
  else if(model.startScene<0||model.startScene>=model.scenes.length)issues.push({severity:'error',code:'start-scene',line:model.sceneDefLine,message:`Start scene index ${model.startScene} is outside the ${model.scenes.length} scenes in file order.`,repair:model.sceneDefLine==null?null:{sectionLine:model.sceneDefLine,key:'startscene',value:'0',label:`Start at ${model.scenes[0].name}`}});
  const seen=new Set();
  for(const scene of model.scenes){
    if(seen.has(scene.key))issues.push({severity:'error',code:'duplicate-scene',line:scene.line,message:`[${scene.name}] is defined more than once.`});seen.add(scene.key);
    if(!scene.endTimeOwn||scene.endTime<=0)issues.push({severity:'warning',code:'scene-duration',line:scene.line,message:`${scene.name} has ${scene.endTimeOwn?'zero or negative':'no'} end.time and ends immediately unless waitforloading holds it.`,repair:{sectionLine:scene.line,key:'end.time',value:'180',label:'Use 180 ticks'}});
    if(scene.jump!==null&&(scene.jump<0||scene.jump>=model.scenes.length))issues.push({severity:'error',code:'jump-index',line:scene.line,message:`${scene.name} jump index ${scene.jump} is outside the ${model.scenes.length} scenes in file order.`});
    if(scene.jump===scene.ordinal)issues.push({severity:'info',code:'jump-self-ignored',line:scene.line,message:`${scene.name} jumps to itself; IKEMEN ignores that jump and advances to the next scene.`});
    if(model.source?.filename&&scene.bgmOwn&&scene.bgm&&!require('./storyboard_resource_path').resolveStoryboardResource(model.source.filename,scene.bgm,'music').available)issues.push({severity:'warning',code:'music-resource-missing',line:scene.line,message:`${scene.name} assigns BGM ${scene.bgm}, but that music file was not found in the storyboard, game/data, or sound/ search roots.`});
    if(scene.endTime>0&&scene.fadeInTime>scene.endTime)issues.push({severity:'warning',code:'fadein-duration',line:scene.line,message:`${scene.name} fadein.time ${scene.fadeInTime} exceeds end.time ${scene.endTime}; the fade will still be active when this scene ends.`});
    if(scene.endTime>0&&scene.fadeOutTime>scene.endTime)issues.push({severity:'warning',code:'fadeout-duration',line:scene.line,message:`${scene.name} fadeout.time ${scene.fadeOutTime} exceeds end.time ${scene.endTime}; IKEMEN starts the fade at tick 0.`});
    if(scene.sounds.length&&!model.snd)issues.push({severity:'warning',code:'sound-archive-missing',line:scene.line,message:`${scene.name} has ${scene.sounds.length} sound cue(s), but SceneDef has no SND archive. Assign one in Storyboard settings before playback.`});
    if(!scene.layers.length)issues.push({severity:'warning',code:'empty-scene',line:scene.line,message:`${scene.name} has no visual layers.`});
    for(const layer of scene.layers)if(layer.spellings.length>1)issues.push({severity:'error',code:'ambiguous-layer-family',line:scene.line,message:`${scene.name} contains both layer${layer.index} and layer_${layer.index}; resolve the two engine layers in text before visual editing.`});
    for(const sound of scene.sounds)if(sound.spellings.length>1)issues.push({severity:'error',code:'ambiguous-sound-family',line:scene.line,message:`${scene.name} contains both sound${sound.index} and sound_${sound.index}; resolve the two engine cues in text before visual editing.`});
    for(const layer of scene.layers){
      if(!layer.sprite&&layer.animation===null&&!layer.font&&!layer.text)issues.push({severity:'warning',code:'empty-layer',line:scene.line,message:`${scene.name}, layer ${layer.index} has no sprite, animation, font, or text source.`});
      if(layer.text&&!layer.font)issues.push({severity:'warning',code:'text-font-missing',line:scene.line,message:`${scene.name}, layer ${layer.index} has text without layer${layer.index}.font, so the text may not be visible.`});
      if(layer.text&&layer.font){const slot=Number(String(layer.font).split(',')[0]);if(Number.isSafeInteger(slot)&&slot>=0&&!model.fonts[`font${slot}`])issues.push({severity:'warning',code:'text-font-slot',line:scene.line,message:`${scene.name}, layer ${layer.index} refers to font${slot}, but SceneDef does not assign that font slot.`});}
      if(layer.position[0]<0||layer.position[1]<0||layer.position[0]>model.localCoord[0]||layer.position[1]>model.localCoord[1])issues.push({severity:'info',code:'off-canvas-layer',line:scene.line,message:`${scene.name}, layer ${layer.index} starts outside the ${model.localCoord.join('×')} canvas. This can be intentional for motion.`});
    }
  }
  if(model.scenes.length&&model.startScene>=0&&model.startScene<model.scenes.length){const seen=new Map();let index=model.startScene;while(index>=0&&index<model.scenes.length){if(seen.has(index)){const cycle=[...seen.keys()].slice(seen.get(index)).map(position=>model.scenes[position].name);issues.push({severity:'warning',code:'jump-cycle',line:model.scenes[index].line,message:`The timed path from startscene loops through ${cycle.join(' → ')}; scene timing alone will not exit. Cancel or loading completion may still end playback.`});break}seen.set(index,seen.size);const scene=model.scenes[index];index=scene.jump!==null&&scene.jump!==index&&scene.jump>=0&&scene.jump<model.scenes.length?scene.jump:index+1;}}
  if(waitForLoading&&model.scenes.length){const last=model.scenes.at(-1);issues.push({severity:'info',code:'waitforloading-hold',line:last.line,message:'waitforloading can fade and finish from any current scene as soon as local loading and network readiness complete, even before end.time. If still loading after the final scene end.time, that scene holds. Skip input is disabled.'});}
  return issues.map(issue=>issue.repair?{...issue,repair:Object.freeze({...issue.repair})}:issue);
}
function appendScene(text, number) { return appendSection(text, `Scene ${number}`, { clearcolor: '0,0,0', 'fadein.time': 15, 'fadeout.time': 15, 'layer0.offset': '160,120', 'layer0.spr': '0,0', 'layer0.starttime': 0, 'end.time': 180 }); }
function duplicateScene(text, line, number) { return duplicateSection(text, line, `Scene ${number}`); }
function deleteScene(text, line) { return deleteSection(text, line); }
function removeScenePreservingIndices(text, line) {
  const document=def.parseDef(text),model=storyboardModel(document),removed=model.scenes.findIndex(scene=>scene.line===line);
  if(removed<0)throw new Error('The selected storyboard scene no longer exists.');
  const destination=index=>index>removed?index-1:index===removed?Math.min(removed,model.scenes.length-2):index;
  const setAt=(source,sectionLine,key,value)=>def.setSectionEntry(def.parseDef('\n'+source),sectionLine+1,key,value).slice(1);
  let next=text;
  if(model.scenes.length>1){
    const sceneDef=def.sections(document,'SceneDef')[0];
    if(sceneDef&&def.sectionMap(sceneDef).startscene!==undefined&&destination(model.startScene)!==model.startScene)next=setAt(next,sceneDef.line,'startscene',String(destination(model.startScene)));
    for(const scene of model.scenes){
      if(scene.line===line||scene.jump===null||destination(scene.jump)===scene.jump)continue;
      next=setAt(next,scene.line,'jump',String(destination(scene.jump)));
    }
  }
  return deleteScene(next,line);
}
function appendLayer(text, sceneLine, options = {}) {
  const document = def.parseDef(text), section = document.sections.find((item) => item.line === Number(sceneLine));
  if (!section || !/^scene(?:\s+.+)?$/i.test(section.name)) throw new Error('The selected storyboard scene no longer exists.');
  const index = Math.max(0, Math.trunc(Number(options.index) || 0)), prefix = `layer${index}.`;
  if (section.entries.some((entry) => new RegExp(`^layer_?${index}\\.`).test(entry.normalized))) throw new Error(`Layer ${index} already exists in [${section.name}].`);
  const kind = options.kind || 'sprite', lines = [`${prefix}offset = ${options.pos || '160,120'}`];
  if (kind === 'animation') lines.push(`${prefix}anim = ${Number(options.reference) || 0}`);
  else if (kind === 'text') { lines.push(`${prefix}font = ${options.font || '0,0,0'}`); const text = String(options.text ?? 'New text'); if (/[\r\n]/.test(text)) throw new Error('Enter one line of storyboard text.'); lines.push(`${prefix}text = """${text}"""`); const coord = storyboardModel(document).localCoord; lines.push(`${prefix}textwindow = 0,0,${coord.join(',')}`); }
  else lines.push(`${prefix}spr = ${options.reference || '0,0'}`);
  lines.push(`${prefix}starttime = ${Math.max(0, Number(options.startTime) || 0)}`, '');
  const next = document.sections.find((item) => item.line > section.line), at = next ? next.line : document.lines.length, output = [...document.lines]; output.splice(at, 0, ...lines);
  return output.join(document.text.includes('\r\n') ? '\r\n' : '\n');
}

module.exports = { TYPES, storyboardTemplate, storyboardModel, validateStoryboard, appendScene, duplicateScene, deleteScene, removeScenePreservingIndices, appendLayer };
