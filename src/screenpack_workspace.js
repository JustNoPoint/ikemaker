'use strict';

const vscode = require('vscode');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const fs = require('fs');
const path = require('path');
const { parseDef, kind, sections, setSectionEntry } = require('./def_model');
const { screenpackModel, validateScreenpack } = require('./screenpack_model');
const { readSff, spriteDataUri } = require('./sff_reader');
const { loadFontPreview } = require('./ui_font_preview');
const { resolveAsset, gameRoot } = require('./stage_workspace');
const { characterUiBridge, previewProfile } = require('./ui_integration');
const { embeddedActions } = require('./def_actions');
const { hash, transactionalWrite, optionsFromConfig, policyFromConfig } = require('./mutation_safety');
const { mode } = require('./experience');
const { workspaceExperience } = require('./experience_model');
const { workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript } = require('./guided_workflows');
const { chooseFileOrFolder } = require('./open_target_picker');
const { registerAuthoringPanel } = require('./authoring_context_registry');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { appendSection, appendUiElement } = require('./visual_def_authoring');
const { FormDrafts } = require('./form_drafts');

const panelMessageHandlers = new WeakMap();
const panelStates = new WeakMap();
let formDrafts = new FormDrafts();

const openPanels = new Map();
function panelKey(filename, workspaceMode = '') { return path.resolve(filename).toLowerCase() + '|' + workspaceMode; }
function screenpackDraftKey(filename,workspaceMode){return `screenpack:${panelKey(filename,workspaceMode)}`;}
function safeScreenpackDraft(value){if(!value||typeof value!=='object'||typeof value.sourceHash!=='string')return null;const overrides={};for(const [key,position] of Object.entries(value.overrides||{}).slice(0,2000))if(/^\d+:\d+$/.test(key)&&Array.isArray(position)&&position.length===2&&position.every(Number.isFinite))overrides[key]=position.map(Number);const grid={};for(const key of ['gridRows','gridColumns','gridX','gridY','cellW','cellH','spaceX','spaceY'])if(Number.isFinite(Number(value.grid?.[key])))grid[key]=Number(value.grid[key]);return{sourceHash:value.sourceHash,overrides,grid};}
function trackPanel(panel, filename, workspaceMode = '') {
  const key = panelKey(filename, workspaceMode), existing = openPanels.get(key);
  if (existing && existing !== panel) { panel.dispose(); return false; }
  if (!existing) {
    openPanels.set(key, panel);
    const state={busy:0};panelStates.set(panel,state);require('./viewer_close').support(panel,{isBusy:()=>state.busy>0,keepDraft:()=>formDrafts.flush()});
    panel.onDidDispose(() => { if (openPanels.get(key) === panel) openPanels.delete(key);panelStates.delete(panel); });
    const folder = path.dirname(filename), broad = /^(?:data|motif)$/i.test(path.basename(folder));
    registerAuthoringPanel(panel, { type: 'screenpack', key: filename, label: path.basename(filename, path.extname(filename)), root: broad ? '' : folder, files: [filename] });
  }
  return true;
}


function mutationOptions(filename, label, overrides = {}) {
  return optionsFromConfig(vscode, filename, label, { journalRoot: gameRoot(filename) || path.dirname(filename), ...overrides });
}

function luaModuleTemplate() {
  return `-- Project-owned screenpack module.
-- Loaded through [Files] module; do not edit IKEMEN's default Lua scripts.
-- Appropriate: menus, motif presentation, option flow, selection, profiles,
-- and pre/post-match orchestration.
-- Rollback-relevant input, movement, collision, damage, meter, and state
-- behavior must remain in deterministic native/ZSS systems.

local module = {}

function module.initialize()
	-- Register reviewed screenpack hooks here.
end

return module
`;
}

async function openOrCreateLuaModule(filename, create = true) {
  const source = fs.readFileSync(filename, 'utf8'), document = parseDef(source, filename), model = screenpackModel(document);
  if (model.module) {
    const target = resolveAsset(model.module, filename);
    if (!fs.existsSync(target)) {
      if (!create) throw new Error(`The configured Lua module is missing: ${target}`);
      transactionalWrite(fs, target, luaModuleTemplate(), mutationOptions(filename, 'screenpack-lua-module', { allowExisting: false }));
    }
    return target;
  }
  if (!create) return '';
  const answer = await vscode.window.showInformationMessage('This screenpack has no [Files] module. Create project-owned screenpack.lua and assign it without modifying IKEMEN default Lua?', { modal: true }, 'Create Module');
  if (answer !== 'Create Module') return '';
  const files = sections(document, 'Files')[0]; if (!files) throw new Error('The screenpack DEF has no [Files] section.');
  const target = path.join(path.dirname(filename), 'screenpack.lua');
  if (!fs.existsSync(target)) transactionalWrite(fs, target, luaModuleTemplate(), mutationOptions(filename, 'screenpack-lua-module', { allowExisting: false }));
  const next = setSectionEntry(document, files.line, 'module', 'screenpack.lua');
  transactionalWrite(fs, filename, next, mutationOptions(filename, 'screenpack-assign-lua-module', { expectedHash: hash(source) }));
  return target;
}

function uiPayload(filename, experience = workspaceExperience('screenpack', 'learning'), workspaceMode = 'screenpack') {
  const text = fs.readFileSync(filename, 'utf8'), document = parseDef(text, filename), type = kind(document);
  if (!['screenpack', 'lifebar'].includes(type)) throw new Error('This DEF was not recognized as a screenpack or fight/lifebar definition.');
  const model = screenpackModel(document);
  const animations = embeddedActions(text);
  let archive = null, sffError = '', sffPath = '';
  if (model.sff) {
    sffPath = resolveAsset(model.sff, filename);
    try { archive = readSff(sffPath); } catch (error) { sffError = error.message; }
  }
  const images = {}, spriteInfo = {}, refs = new Set();
  for (const screen of model.screens) for (const element of screen.elements) {
    if (element.sprite) refs.add(element.sprite.join(','));
    else if (element.animation !== null && animations[element.animation]) refs.add(animations[element.animation].sprite.join(','));
  }
  if (archive) for (const key of [...refs].slice(0, 2000)) {
    const [group, number] = key.split(',').map(Number), sprite = archive.sprites.find((item) => item.group === group && item.number === number);
    if (!sprite) continue;
    try { images[key] = spriteDataUri(archive, sprite); spriteInfo[key] = { width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY }; } catch (_) {}
  }
  let previewProfiles = previewProfile(), profilePath = '', profileError = '';
  const root = gameRoot(filename), candidate = root && path.join(root, '.ikemen', 'ui-preview-profiles.json');
  if (candidate && fs.existsSync(candidate)) {
    profilePath = candidate;
    try {
      const loaded = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (!loaded || !Array.isArray(loaded.profiles)) throw new Error('profiles must be an array');
      previewProfiles = loaded;
    } catch (error) { profileError = error.message; }
  }
  const animationIssues = model.screens.flatMap((screen) => screen.elements
    .filter((item) => item.animation !== null && !animations[item.animation])
    .map((item) => ({ severity: 'error', code: 'missing-animation', line: item.lines.anim, message: `${screen.name}: ${item.name} references missing Begin Action ${item.animation}.` })));
  const fonts = Object.fromEntries(model.fonts.map(font => [font.slot, loadFontPreview(font.path, filename, root)]));
  const modulePath = model.module ? resolveAsset(model.module, filename) : '';
  const screens = model.screens.map((screen) => ({ ...screen, elements: screen.elements.map((element) => {
    const embeddedAction = element.animation !== null && animations[element.animation];
    const reference = element.sprite || (embeddedAction && embeddedAction.sprite);
    return { ...element, assetSprite: reference ? [...reference] : null, actionLine: embeddedAction ? embeddedAction.line : null };
  }) }));
  return { filename, fileLabel: path.basename(filename), workspaceMode, sourceHash: hash(text), mutation: policyFromConfig(vscode, filename), experience, type, sffPath, sffError, modulePath, moduleExists: Boolean(modulePath && fs.existsSync(modulePath)), images, spriteInfo, animations, fonts, previewProfiles, profilePath, profileError, model: { ...model, source: undefined, screens }, issues: [...validateScreenpack(model, archive), ...animationIssues] };
}

function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }

function screenpackSpriteHandoff(payload, request) {
  const screen = payload?.model?.screens?.find((item) => (item.normalized || item.name) === request?.screen);
  const selected = screen?.elements?.find((item) => item.name === request?.name);
  const reference = selected && selected.assetSprite;
  if (!selected || !reference || reference[0] !== Number(request?.group) || reference[1] !== Number(request?.number)) return null;
  return { sffPath: payload.sffPath, group: reference[0], number: reference[1], screen, selected };
}

function recoveryClientScript(){return `const draftStatus=document.createElement('span'),discardDraft=document.createElement('button');draftStatus.className='small';discardDraft.textContent='Discard preview draft';discardDraft.disabled=true;toolbar.insertBefore(draftStatus,document.getElementById('fit'));toolbar.insertBefore(discardDraft,document.getElementById('fit'));const baseGrid=model.selectGrid?{gridRows:model.selectGrid.rows,gridColumns:model.selectGrid.columns,gridX:model.selectGrid.position[0],gridY:model.selectGrid.position[1],cellW:model.selectGrid.cellSize[0],cellH:model.selectGrid.cellSize[1],spaceX:model.selectGrid.spacing[0],spaceY:model.selectGrid.spacing[1]}:{};let draftRevision=0,draftPending=new Set(),draftDirty=false;function gridState(){const result={};for(const key of Object.keys(baseGrid)){const node=document.getElementById(key);if(node)result[key]=Number(node.value)||0}return result}function creativeState(){return{sourceHash:data.sourceHash,overrides:Object.fromEntries(Object.entries(overrides).map(([key,value])=>[key,[Number(value[0]),Number(value[1])]])),grid:gridState()}}function hasCreativeChanges(){if(Object.keys(overrides).length)return true;const current=gridState();return Object.keys(baseGrid).some(key=>current[key]!==baseGrid[key])}function stageScreenpackDraft(){if(!hasCreativeChanges()){draftDirty=false;discardDraft.disabled=true;draftStatus.textContent='';vscode.postMessage({type:'screenpackDiscardDraft',quiet:true});return}draftDirty=true;discardDraft.disabled=false;const revision=++draftRevision;draftPending.add(revision);draftStatus.textContent='Keeping preview draft…';vscode.postMessage({type:'screenpackDraft',revision,draft:creativeState()})}function navigationState(){const screen=current(),item=element(),profile=(data.previewProfiles.profiles||[])[profileIndex];return{workspaceMode:data.workspaceMode,sourceHash:data.sourceHash,screen:screen.normalized||screen.name,element:item?.name||'',profile:profile?.id||profile?.label||profileIndex,aspect:document.getElementById('aspect').value,guides,visible:{...visible}}}function applyNavigation(reference){if(!reference)return;const wanted=model.screens.findIndex(screen=>(screen.normalized||screen.name)===reference.screen);if(wanted>=0){screenIndex=wanted;screenSelect.value=wanted;const item=model.screens[wanted].elements.findIndex(value=>value.name===reference.element);selected=item>=0?item:0}const profiles=data.previewProfiles.profiles||[],profile=profiles.findIndex((value,index)=>(value.id||value.label||index)===reference.profile);if(profile>=0){profileIndex=profile;profileSelect.value=profile}if(['file','4:3','16:9','21:9'].includes(reference.aspect))document.getElementById('aspect').value=reference.aspect;if(typeof reference.guides==='boolean')guides=reference.guides;for(const key of Object.keys(visible))if(typeof reference.visible?.[key]==='boolean')visible[key]=reference.visible[key];list();inspect();render()}function applyRecoveredDraft(value){if(!value||value.sourceHash!==data.sourceHash)return false;for(const key of Object.keys(overrides))delete overrides[key];for(const [key,position] of Object.entries(value.overrides||{}))overrides[key]=position;for(const [key,entry] of Object.entries(value.grid||{})){const node=document.getElementById(key);if(node)node.value=entry}draftDirty=hasCreativeChanges();discardDraft.disabled=!draftDirty;draftStatus.textContent=draftDirty?'Recovered unsaved preview changes.':'';inspect();render();return draftDirty}applyNavigation(data.presetReference);applyRecoveredDraft(data.recoveredDraft);for(const id of ['x','y','gridRows','gridColumns','gridX','gridY','cellW','cellH','spaceX','spaceY'])document.getElementById(id)?.addEventListener('input',stageScreenpackDraft);document.getElementById('mirror').addEventListener('click',()=>setTimeout(stageScreenpackDraft));document.getElementById('discard').addEventListener('click',()=>setTimeout(stageScreenpackDraft));window.addEventListener('mouseup',()=>{if(hasCreativeChanges())stageScreenpackDraft()});discardDraft.onclick=()=>vscode.postMessage({type:'screenpackDiscardDraft'});window.addEventListener('message',event=>{const message=event.data;if(message.type==='screenpackDraftStored'){draftPending.delete(message.revision);draftStatus.textContent='Preview changes are recoverable.'}});globalThis.ikemenNavigationSelection=navigationState;globalThis.ikemenCanRestoreNavigation=reference=>JSON.stringify(reference)===JSON.stringify(navigationState());globalThis.ikemenRestoreNavigation=()=>{};globalThis.ikemenIsBusy=()=>draftPending.size>0;globalThis.ikemenHasUnappliedForms=()=>draftDirty;globalThis.ikemenCanKeepDraft=()=>draftDirty&&!draftPending.size;`}

function uiHtml(data) {
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:dark;--panel:#191c21;--line:#373e48;--accent:#45d4d4;--muted:#98a5b2;--yellow:#f2c94c}*{box-sizing:border-box}body{margin:0;background:#101217;color:#e7edf3;font:12px var(--vscode-font-family,Segoe UI);overflow:hidden}.app{height:100vh;display:grid;grid-template-columns:250px minmax(380px,1fr) 310px;grid-template-rows:auto minmax(0,1fr) auto}.toolbar{grid-column:1/4;display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:7px 10px;background:var(--panel);border-bottom:1px solid var(--line)}button,select,input{font:inherit;color:inherit;background:#282e36;border:1px solid #47515e;border-radius:3px;padding:5px}button.active{border-color:var(--accent);background:#124f57}.side{min-width:0;background:var(--panel);overflow:auto;padding:10px}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}.viewport{position:relative;overflow:hidden;background:repeating-conic-gradient(#1a2027 0 25%,#14191f 0 50%) 50%/24px 24px}.pan{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}canvas{display:block;background:#080b12;box-shadow:0 0 0 1px #56616d}.status{grid-column:1/4;padding:5px 10px;background:var(--panel);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}h2,h3{margin:5px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.element{padding:6px;border-bottom:1px solid #2b3038;cursor:pointer}.element.selected{background:#16474e}.element .meta,.small{font-size:10px;color:var(--muted)}.row{display:grid;grid-template-columns:95px 1fr;gap:6px;margin:5px 0;align-items:center}.value{font-family:var(--vscode-editor-font-family,monospace)}.issue{padding:6px;margin:5px 0;border-left:3px solid #6380a0;background:#222830}.issue.error{border-color:#ff6b6b}.issue.warning{border-color:#f2c94c}.patch{width:100%;height:62px;background:#101419;color:#dce8f2;font-family:monospace}.layers{display:flex;gap:3px}.fit{margin-left:auto}.guide{display:flex;gap:5px;flex-wrap:wrap}.row input,.row select{min-width:0;width:100%}.toolbar button{white-space:nowrap}.toolbar select{max-width:100%}.element{overflow-wrap:anywhere}@media(max-width:1100px){body{overflow:auto}.app{height:auto;min-height:100vh;grid-template-columns:minmax(0,1fr);grid-template-rows:auto 380px auto auto auto}.toolbar,.status{grid-column:1}.toolbar{grid-row:1}.viewport{grid-row:2}.left{grid-row:3;max-height:360px}.right{grid-row:4;overflow:visible}.status{grid-row:5;white-space:normal;overflow-wrap:anywhere}}
  </style></head><body><div class="app"><div class="toolbar"><b>${data.workspaceMode === 'select-layout' ? 'CHARACTER SELECT LAYOUT BUILDER' : 'Screenpack / Fight UI'}</b><span title="Change this with IKEMEN: Configure Learning / Advanced Experience">${data.experience.label}</span><select id="screen" aria-label="Screenpack section"></select><span id="coord"></span><div class="layers" role="group" aria-label="Visible sprite layers"><button data-layer="-1" class="active" title="Toggle background layer -1">-1</button><button data-layer="0" class="active" title="Toggle layer 0">0</button><button data-layer="1" class="active" title="Toggle foreground layer 1">1</button><button data-layer="2" class="active" title="Toggle foreground layer 2">2</button></div><button id="guides" class="active" title="Show or hide position and safe-area guides">Guides</button><select id="aspect" aria-label="Preview safe area"><option value="file">File coordinates</option><option value="4:3">4:3 safe area</option><option value="16:9">16:9 safe area</option><option value="21:9">21:9 safe area</option></select><button id="mirror" title="Mirror the selected player-one element as a player-two preview">Mirror P1 → P2 preview</button><button id="fit" class="fit" title="Fit the whole screenpack canvas in the available viewport">Fit</button></div><aside class="side left">${data.workspaceMode === 'select-layout' ? '<div class="issue warning"><b>LAYOUT MODE</b><br>This edits the motif, not the roster. Every write requires confirmation and uses the configured backup/history policy.</div>' : ''}<div class="guide"><button id="addScreen" title="Create a new screen section">+ Screen</button><button id="addElement" title="Create a sprite, animation, or text element in the selected screen">+ Element</button></div><h2>Elements</h2><div id="elements"></div><h3>Validation</h3><div id="issues"></div></aside><main class="viewport" id="viewport"><div class="pan" id="pan"><canvas id="canvas" aria-label="Screenpack visual preview"></canvas></div></main><aside class="side right">${data.workspaceMode === 'select-layout' && data.model.selectGrid ? '<h2>Character grid</h2><div class="row"><span>Rows</span><input id="gridRows" aria-label="Grid rows" type="number" min="1"></div><div class="row"><span>Columns</span><input id="gridColumns" aria-label="Grid columns" type="number" min="1"></div><div class="row"><span>Origin X</span><input id="gridX" aria-label="Grid origin X" type="number"></div><div class="row"><span>Origin Y</span><input id="gridY" aria-label="Grid origin Y" type="number"></div><div class="row"><span>Cell width</span><input id="cellW" aria-label="Grid cell width" type="number"></div><div class="row"><span>Cell height</span><input id="cellH" aria-label="Grid cell height" type="number"></div><div class="row"><span>Spacing X</span><input id="spaceX" aria-label="Horizontal cell spacing" type="number"></div><div class="row"><span>Spacing Y</span><input id="spaceY" aria-label="Vertical cell spacing" type="number"></div><button id="applyGrid">Review and apply grid</button><p class="small">The cyan boxes are a preview. Roster entries remain in select.def and are not changed here.</p>' : ''}<details ${data.experience.guidanceOpen ? 'open' : ''}><summary><b>What am I editing?</b></summary><p class="small"><b>${data.experience.title}.</b> ${data.experience.guidance}</p></details><h2>Selected element</h2><div id="inspector"></div><button id="source">Open source line</button><h3>Preview position</h3><div class="row"><span>X</span><input id="x" aria-label="Selected element X position" type="number"></div><div class="row"><span>Y</span><input id="y" aria-label="Selected element Y position" type="number"></div><textarea id="patch" class="patch" aria-label="Generated position patch" readonly></textarea><div class="guide"><button id="copy">Copy patch</button><button id="apply">Apply reviewed position</button><button id="discard">Discard</button></div><p class="small">Drag the selected element. The editor preserves whether its source uses pos or offset.</p></aside><div class="status" id="status" role="status" aria-live="polite"></div></div><script>
  const vscode=acquireVsCodeApi(),data=${json(data)},model=data.model,canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d'),viewport=document.getElementById('viewport'),pan=document.getElementById('pan'),images={};let screenIndex=data.workspaceMode==='select-layout'?Math.max(0,model.screens.findIndex(x=>x.normalized==='select info')):0,selected=0,viewScale=1,guides=true,drag=null;const savedView=vscode.getState();if(savedView&&savedView.filename===data.filename&&savedView.workspaceMode===data.workspaceMode){screenIndex=Math.max(0,Math.min(model.screens.length-1,Number(savedView.screenIndex)||0));selected=Math.max(0,Math.min(model.screens[screenIndex].elements.length-1,Number(savedView.selected)||0))}const visible={[-1]:true,0:true,1:true,2:true},overrides={};canvas.width=model.localCoord[0];canvas.height=model.localCoord[1];document.getElementById('coord').textContent=model.localCoord.join(' × ');
  document.getElementById('source').insertAdjacentHTML('afterend','<div class="guide" style="margin-top:5px"><button id="assetSprite" data-ikemen-destination="sff" disabled>Open sprite in SFF</button><button id="assetAction" data-ikemen-destination="screenpack" disabled>Open embedded action</button></div><p class="small">Asset buttons navigate to the exact authored destination. Editing remains owned by that destination workspace.</p>');document.getElementById('source').dataset.ikemenDestination='screenpack';
  const toolbar=document.querySelector('.toolbar'),luaModule=document.createElement('button'),luaStructure=document.createElement('button');luaModule.id='luaModule';luaModule.textContent='Lua Module';luaModule.title="Open or create this screenpack's project-owned Lua module.";luaStructure.id='luaStructure';luaStructure.textContent='Lua Structure';luaStructure.title='Open the Lua module beside its visual structure tree.';toolbar.insertBefore(luaStructure,toolbar.querySelector('.layers'));toolbar.insertBefore(luaModule,luaStructure);luaModule.onclick=()=>vscode.postMessage({type:'openLuaModule'});luaStructure.onclick=()=>vscode.postMessage({type:'openLuaStructure'});luaStructure.disabled=!data.moduleExists;
  for(const [key,src] of Object.entries(data.images)){const image=new Image();image.onload=render;image.src=src;images[key]=image}
  const fontImages={};for(const [slot,font] of Object.entries(data.fonts||{}))for(const [code,glyph] of Object.entries(font.glyphs||{})){const image=new Image();image.onload=render;image.src=glyph.src;fontImages[slot+':'+code]=image}
  function drawFont(item,text){const values=item.font.split(',').map(Number),slot=values[0],font=data.fonts&&data.fonts[slot];if(!font||font.state!=='bitmap'||(values[1]||0)!==0)return false;const chars=Array.from(text),width=chars.reduce((sum,c,index)=>sum+(font.glyphs[c.codePointAt(0)]?.width||font.size[0])+(index<chars.length-1?font.spacing[0]:0),0);let x=font.offset[0]-(values[2]===0?width/2:values[2]<0?width:0),y=font.offset[1]-font.size[1]+1;ctx.imageSmoothingEnabled=false;for(const c of chars){const code=c.codePointAt(0),glyph=font.glyphs[code],image=fontImages[slot+':'+code];if(glyph&&image&&image.complete)ctx.drawImage(image,x-glyph.axisX,y-glyph.axisY);x+=(glyph?.width||font.size[0])+font.spacing[0]}return true}
  function screenCategory(name){const n=name.toLowerCase();if(n.includes('select'))return'Character Select';if(n.includes('versus')||n.includes('vs screen'))return'Versus';if(n.includes('option'))return'Options';if(n.includes('pause')||n.includes('training'))return'Pause and Training';if(n.includes('title')||n.includes('menu'))return'Title and Menus';if(/(^|\s)p[1-8](\.|\s)|life|power|combo|round|time|win|guard|stun|score/.test(n))return'Fight UI';return'Other'}
  const screenSelect=document.getElementById('screen'),screenGroups={};model.screens.forEach((screen,index)=>{const category=screenCategory(screen.name),group=screenGroups[category]||(screenGroups[category]=document.createElement('optgroup'));group.label=category;if(!group.parentNode)screenSelect.appendChild(group);const option=document.createElement('option');option.value=index;option.textContent=screen.name;group.appendChild(option)});screenSelect.onchange=()=>{screenIndex=Number(screenSelect.value);selected=0;list();inspect();render()};
  let profileIndex=0;const profileSelect=document.createElement('select');profileSelect.title='Editor-only sample data';screenSelect.after(profileSelect);(data.previewProfiles.profiles||[]).forEach((profile,index)=>{const option=document.createElement('option');option.value=index;option.textContent=profile.label||profile.id||('Profile '+(index+1));profileSelect.appendChild(option)});profileSelect.onchange=()=>{profileIndex=Number(profileSelect.value);status();render()};
  function current(){return model.screens[screenIndex]||{elements:[],name:'No visual sections',line:0}}function element(){return current().elements[selected]}
  function parentPosition(item){let base=item.name;while(base.includes('.')){base=base.slice(0,base.lastIndexOf('.'));const index=current().elements.findIndex(x=>x.name===base);if(index>=0)return basePosition(current().elements[index],index)}return[0,0]}
  function position(item){return item?basePosition(item,current().elements.indexOf(item)):[0,0]}
  function localPosition(item){const p=position(item);if(!item.properties.pos){const parent=parentPosition(item);return[p[0]-parent[0],p[1]-parent[1]]}return p}
  function fit(){viewScale=Math.min((viewport.clientWidth-30)/canvas.width,(viewport.clientHeight-30)/canvas.height);pan.style.transform='translate(-50%,-50%) scale('+viewScale+')';status()}
  function status(){const profile=(data.previewProfiles.profiles||[])[profileIndex];document.getElementById('status').textContent=(data.type==='lifebar'?'Fight UI':'Screenpack')+' | '+data.fileLabel+' | sample '+(profile&&(profile.label||profile.id)||'default')+' | Approximate text/font preview; launch IKEMEN for final rendering | view '+Math.round(viewScale*100)+'% | Direct save · backups '+(data.mutation.backups?'on':'off')+' · history '+(data.mutation.history?'on':'off')+(data.sffError?' | SFF: '+data.sffError:'')+(data.profileError?' | Profile: '+data.profileError:'')}
  function safeArea(){const mode=document.getElementById('aspect').value;if(mode==='file')return[0,0,canvas.width,canvas.height];const ratio=mode==='4:3'?4/3:mode==='16:9'?16/9:21/9,current=canvas.width/canvas.height;if(current>ratio){const w=canvas.height*ratio;return[(canvas.width-w)/2,0,w,canvas.height]}const h=canvas.width/ratio;return[0,(canvas.height-h)/2,canvas.width,h]}
  function sampleText(item){const profile=(data.previewProfiles.profiles||[])[profileIndex]||{},name=String(item.name||'').toLowerCase(),slot=/p([1-8])(?:\.|$)/.exec(name),player=slot&&(profile.players||[]).find(x=>Number(x.slot)===Number(slot[1]));if(player){if(name.includes('name'))return player.name;if(name.includes('score'))return String(player.score);if(name.includes('life'))return String(player.life);if(name.includes('power')||name.includes('meter'))return String(player.power);if(name.includes('guard'))return String(player.guard);if(name.includes('stun')||name.includes('dizzy'))return String(player.stun)}if(name==='menu.item')return 'Arcade';if(name==='menu')return 'Menu anchor';if(name.includes('time'))return String(profile.timer??99);if(name.includes('combo'))return String((profile.combo&&profile.combo.hits)??3)+' HITS';return item.animation!==null?'Anim '+item.animation:item.name}
  function render(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#0c1118';ctx.fillRect(0,0,canvas.width,canvas.height);const elements=current().elements;for(const layer of [-1,0,1,2])if(visible[layer])for(let i=0;i<elements.length;i++){const item=elements[i];if(item.hidden||item.layer!==layer)continue;const p=i===selected?position(item):basePosition(item,i),frame=item.animation!==null&&data.animations[item.animation],key=item.sprite?item.sprite.join(','):frame?frame.sprite.join(','):null,image=key&&images[key],info=key&&data.spriteInfo[key],offset=frame?frame.offset:[0,0];ctx.save();ctx.translate(p[0]+offset[0],p[1]+offset[1]);if(item.angle)ctx.rotate(item.angle*Math.PI/180);ctx.scale(item.facing*item.scale[0],item.verticalFacing*item.scale[1]);ctx.transform(1,0,item.xShear,1,0,0);if(image&&image.complete){ctx.drawImage(image,-info.axisX,-info.axisY);if(i===selected){ctx.strokeStyle='#45d4d4';ctx.lineWidth=2/Math.max(.1,item.scale[0]);ctx.strokeRect(-info.axisX,-info.axisY,info.width,info.height)}}else if(item.font&&drawFont(item,sampleText(item))){if(i===selected){ctx.strokeStyle='#45d4d4';ctx.strokeRect(-3,-3,6,6)}}else if(!item.font&&item.animation===null){if(guides){ctx.strokeStyle=i===selected?'#45d4d4':'#8292a5';ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.moveTo(0,-5);ctx.lineTo(0,5);ctx.stroke()}}else if(item.font||item.animation!==null||item.properties.pos){ctx.fillStyle=i===selected?'rgba(69,212,212,.28)':'rgba(120,140,165,.2)';ctx.strokeStyle=i===selected?'#45d4d4':'#8292a5';ctx.fillRect(-60,-12,120,24);ctx.strokeRect(-60,-12,120,24);ctx.fillStyle='#eef4f8';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(sampleText(item)+(item.font?' [approx.]':''),0,4)}ctx.restore();if(item.window){ctx.strokeStyle='rgba(255,204,84,.75)';ctx.setLineDash([5,4]);ctx.strokeRect(item.window[0],item.window[1],item.window[2]-item.window[0],item.window[3]-item.window[1]);ctx.setLineDash([])}}if(data.workspaceMode==='select-layout'&&model.selectGrid)drawSelectGrid();if(guides)drawGuides()}
  function gridValue(id,fallback){const input=document.getElementById(id),value=input&&Number(input.value);return Number.isFinite(value)?value:fallback}function drawSelectGrid(){const g=model.selectGrid,rows=Math.max(1,gridValue('gridRows',g.rows)),columns=Math.max(1,gridValue('gridColumns',g.columns)),x=gridValue('gridX',g.position[0]),y=gridValue('gridY',g.position[1]),w=gridValue('cellW',g.cellSize[0]),h=gridValue('cellH',g.cellSize[1]),sx=gridValue('spaceX',g.spacing[0]),sy=gridValue('spaceY',g.spacing[1]);ctx.save();ctx.strokeStyle='#45d4d4';ctx.fillStyle='rgba(69,212,212,.10)';ctx.lineWidth=1;for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const px=x+column*(w+sx)-w/2,py=y+row*(h+sy)-h/2;ctx.fillRect(px,py,w,h);ctx.strokeRect(px,py,w,h)}ctx.restore()}
  function basePosition(item,index){const key=screenIndex+':'+index;if(overrides[key])return overrides[key];if(item.properties.pos)return item.position;const parent=parentPosition(item);return[item.position[0]+parent[0],item.position[1]+parent[1]]}
  function drawGuides(){const area=safeArea();ctx.save();ctx.strokeStyle='#f2c94c';ctx.setLineDash([7,5]);ctx.strokeRect(area[0],area[1],area[2],area[3]);ctx.strokeStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.moveTo(canvas.width/2,0);ctx.lineTo(canvas.width/2,canvas.height);ctx.moveTo(0,canvas.height/2);ctx.lineTo(canvas.width,canvas.height/2);ctx.stroke();ctx.restore()}
  function list(){vscode.setState({filename:data.filename,workspaceMode:data.workspaceMode,screenIndex,selected});const host=document.getElementById('elements');host.innerHTML='';current().elements.forEach((item,index)=>{const row=document.createElement('div');row.className='element'+(index===selected?' selected':'');row.innerHTML='<label><input type="checkbox" checked> <b>'+esc(item.name)+'</b></label><div class="meta">'+(item.sprite?'sprite '+item.sprite.join(','):item.animation!==null?'animation '+item.animation:item.font?'font/text':'anchor')+' · layer '+item.layer+'</div>';row.querySelector('input').onchange=e=>{item.hidden=!e.target.checked;render()};row.onclick=e=>{if(e.target.tagName==='INPUT')return;selected=index;list();inspect();render()};host.appendChild(row)});document.getElementById('issues').innerHTML=data.issues.length?data.issues.map(x=>'<div class="issue '+x.severity+'"><b>'+x.severity.toUpperCase()+'</b><br>'+esc(x.message)+'</div>').join(''):'<div class="issue">No model-level issues found.</div>'}
  function inspect(){const item=element();if(!item){document.getElementById('inspector').textContent='No layout elements were found in this section.';document.getElementById('assetSprite').disabled=true;document.getElementById('assetAction').disabled=true;return}const p=localPosition(item),rows=[['Section',current().name],['Source line',(item.lines.pos??item.lines.offset??item.lines.font??item.lines.spr??item.lines.anim??current().line)+1],['Position kind',item.properties.pos?'pos':item.properties.offset?'offset':'inferred'],['Sprite',item.sprite?item.sprite.join(','):'—'],['Animation',item.animation??'—'],['Font',item.font||'—'],['Layer',item.layer],['Scale',item.scale.join(', ')],['Window',item.window?item.window.join(', '):'—']];document.getElementById('inspector').innerHTML=rows.map(x=>'<div class="row"><span>'+x[0]+'</span><span class="value">'+esc(String(x[1]))+'</span></div>').join('');const spriteButton=document.getElementById('assetSprite'),actionButton=document.getElementById('assetAction');spriteButton.disabled=!item.assetSprite||!data.sffPath||Boolean(data.sffError);spriteButton.title=item.assetSprite?'Open sprite '+item.assetSprite.join(',')+' in '+(data.sffPath||'the screenpack SFF'):'This element has no resolvable sprite';actionButton.disabled=item.actionLine===null;actionButton.title=item.actionLine===null?'This element does not use an embedded Begin Action':'Open Begin Action '+item.animation+' in the screenpack DEF';document.getElementById('x').value=p[0];document.getElementById('y').value=p[1];patch()}
  function patch(){const item=element();if(!item)return;const p=localPosition(item),key=item.properties.pos?((item.base??item.name)?(item.base??item.name)+'.pos':'pos'):((item.base??item.name)?(item.base??item.name)+'.offset':'offset');document.getElementById('patch').value='['+current().name+']\\n'+key+' = '+round(p[0])+', '+round(p[1])}
  function setLocal(){const item=element();if(!item)return;const desired=[Number(document.getElementById('x').value)||0,Number(document.getElementById('y').value)||0],absolute=position(item),local=localPosition(item);overrides[screenIndex+':'+selected]=[absolute[0]+desired[0]-local[0],absolute[1]+desired[1]-local[1]];patch();render()}
  function esc(x){return x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function round(x){return Math.round(x*1000)/1000}
  document.querySelectorAll('[data-layer]').forEach(button=>button.onclick=()=>{const layer=Number(button.dataset.layer);visible[layer]=!visible[layer];button.classList.toggle('active',visible[layer]);render()});document.getElementById('guides').onclick=e=>{guides=!guides;e.target.classList.toggle('active',guides);render()};document.getElementById('aspect').onchange=render;document.getElementById('fit').onclick=fit;document.getElementById('x').oninput=document.getElementById('y').oninput=setLocal;document.getElementById('discard').onclick=()=>{delete overrides[screenIndex+':'+selected];inspect();render()};document.getElementById('copy').onclick=()=>vscode.postMessage({type:'copyPatch',text:document.getElementById('patch').value});document.getElementById('apply').onclick=()=>{const item=element(),p=localPosition(item),key=item.properties.pos?((item.base??item.name)?(item.base??item.name)+'.pos':'pos'):((item.base??item.name)?(item.base??item.name)+'.offset':'offset');vscode.postMessage({type:'applyPosition',sectionLine:current().line,key,value:round(p[0])+', '+round(p[1]),name:item.name})};document.getElementById('mirror').onclick=()=>{const source=current().elements.filter(x=>/^p1(?:\.|$)/.test(x.name));for(const p1 of source){const p2=current().elements.find(x=>x.name===p1.name.replace(/^p1/,'p2'));if(!p2)continue;const target=current().elements.indexOf(p2),p=basePosition(p1,current().elements.indexOf(p1));overrides[screenIndex+':'+target]=[canvas.width-p[0],p[1]]}render()};if(model.selectGrid&&data.workspaceMode==='select-layout'){const g=model.selectGrid,values={gridRows:g.rows,gridColumns:g.columns,gridX:g.position[0],gridY:g.position[1],cellW:g.cellSize[0],cellH:g.cellSize[1],spaceX:g.spacing[0],spaceY:g.spacing[1]};for(const [id,value] of Object.entries(values)){document.getElementById(id).value=value;document.getElementById(id).oninput=render}document.getElementById('applyGrid').onclick=()=>vscode.postMessage({type:'applySelectGrid',values:Object.fromEntries(Object.keys(values).map(id=>[id,Number(document.getElementById(id).value)]))})}
  document.getElementById('source').onclick=()=>{const item=element();vscode.postMessage({type:'openSource',line:item&&(item.lines.pos??item.lines.offset??item.lines.font??item.lines.spr??item.lines.anim??current().line)})};canvas.onmousedown=e=>{if(!element())return;drag={x:e.clientX,y:e.clientY,start:[...position(element())]}};window.onmousemove=e=>{if(!drag)return;const rect=canvas.getBoundingClientRect(),dx=(e.clientX-drag.x)*canvas.width/rect.width,dy=(e.clientY-drag.y)*canvas.height/rect.height;overrides[screenIndex+':'+selected]=[drag.start[0]+dx,drag.start[1]+dy];inspect();render()};window.onmouseup=()=>drag=null;viewport.onwheel=e=>{e.preventDefault();viewScale=Math.max(.1,Math.min(6,viewScale*(e.deltaY<0?1.1:.9)));pan.style.transform='translate(-50%,-50%) scale('+viewScale+')';status()};window.onresize=fit;screenSelect.value=screenIndex;list();inspect();setTimeout(fit,20);
  document.getElementById('assetSprite').onclick=()=>{const item=element();if(item&&item.assetSprite)vscode.postMessage({type:'openScreenpackSprite',screen:current().normalized||current().name,name:item.name,group:item.assetSprite[0],number:item.assetSprite[1]})};document.getElementById('assetAction').onclick=()=>{const item=element();if(item&&item.actionLine!==null)vscode.postMessage({type:'openSource',line:item.actionLine})};
  document.getElementById('addScreen').onclick=()=>vscode.postMessage({type:'addScreen'});document.getElementById('addElement').onclick=()=>vscode.postMessage({type:'addElement',sectionLine:current().line,section:current().name});
  </script></body></html>`;
  return page.replace('<select id="screen"', `${launchControlsHtml('screenpack')}<select id="screen"`).replace('</p></details><h2>Selected element', `</p>${workflowHtml(workflowFor('screenpack', { localCoord: data.model.localCoord, hasSff: Boolean(data.sffPath), sffError: data.sffError, screens: data.model.screens.length, issues: data.issues }))}</details>${taskRecipesHtml('screenpack', data.experience)}${advancedActionBarHtml('screenpack', data.experience)}<h2>Selected element`).replace('</script></body>', `${recoveryClientScript()}${launchControlsClientScript()}${workflowClientScript()}</script></body>`);
}

async function populate(panel, filename, workspaceMode = 'screenpack', presetReference = null) {
  if (!trackPanel(panel, filename, workspaceMode)) return;
  panel.webview.options = { enableScripts: true };
  const payload = uiPayload(filename, workspaceExperience('screenpack', mode('stageUi', vscode.Uri.file(filename))), workspaceMode),storedDraft=safeScreenpackDraft(formDrafts.read(screenpackDraftKey(filename,workspaceMode)));payload.recoveredDraft=storedDraft?.sourceHash===payload.sourceHash?storedDraft:null;payload.presetReference=presetReference; panel.title = workspaceMode === 'select-layout' ? `Character Select Layout: ${payload.model.name}` : `UI: ${payload.model.name}`; panel.webview.html = require('./webview_policy').protect(uiHtml(payload), panel.webview.cspSource);const sessions=require('./viewer_sessions');if(sessions.has(panel))sessions.updateSource(panel,filename);else sessions.register(panel,filename,'screenpack');
  const previousHandler = panelMessageHandlers.get(panel);
  if (previousHandler) previousHandler.dispose();
  const handler = panel.webview.onDidReceiveMessage(async (message) => {
    if(message.type==='screenpackDraft'){const state=panelStates.get(panel);if(!state)return;const draft=safeScreenpackDraft(message.draft);if(!draft||draft.sourceHash!==payload.sourceHash)return;state.busy++;try{await formDrafts.stage(screenpackDraftKey(filename,workspaceMode),draft);panel.webview.postMessage({type:'screenpackDraftStored',revision:message.revision});}catch(error){vscode.window.showWarningMessage(`The screenpack preview draft could not be stored: ${error.message}`);}finally{state.busy--}return;}
    if(message.type==='screenpackDiscardDraft'){const state=panelStates.get(panel);if(!state)return;state.busy++;try{await formDrafts.discard(screenpackDraftKey(filename,workspaceMode));if(!message.quiet)await populate(panel,filename,workspaceMode,presetReference);}catch(error){vscode.window.showWarningMessage(`The screenpack preview draft could not be discarded: ${error.message}`);}finally{state.busy--}return;}
    if (await handleLaunchMessage(message, filename, 'screenpack', panel)) return;
    if (message.type === 'addScreen') {
      const name = await vscode.window.showInputBox({ title: 'New UI screen section', value: 'New Screen Info', validateInput: (value) => value.trim() ? undefined : 'Enter a section name.' }); if (!name) return;
      try { const text = fs.readFileSync(filename, 'utf8'), next = appendSection(text, name, { pos: '160,120', 'background.spr': '0,0', 'background.layerno': 0 }); transactionalWrite(fs, filename, next, mutationOptions(filename, 'add-ui-screen', { expectedHash: payload.sourceHash })); await populate(panel, filename, workspaceMode); } catch (error) { vscode.window.showErrorMessage(`Could not add UI screen: ${error.message}`); } return;
    }
    if (message.type === 'addElement') {
      if (!payload.model.screens.length) return vscode.window.showWarningMessage('Create a screen section first.');
      const base = await vscode.window.showInputBox({ title: `New element in [${message.section}]`, value: 'new.element', validateInput: (value) => /^[A-Za-z0-9_.-]+$/.test(value.trim()) ? undefined : 'Use letters, numbers, dots, dashes, or underscores.' }); if (!base) return;
      const itemType = await vscode.window.showQuickPick([{ label: 'Sprite', value: 'sprite', description: 'A sprite from the screenpack SFF.' }, { label: 'Animation', value: 'anim', description: 'An embedded Begin Action.' }, { label: 'Text / font', value: 'text', description: 'A font-backed text position.' }], { title: 'UI element type' }); if (!itemType) return;
      const reference = await vscode.window.showInputBox({ title: itemType.value === 'sprite' ? 'Sprite group,index' : itemType.value === 'anim' ? 'Animation number' : 'Font triple', value: itemType.value === 'text' ? '0,0,0' : itemType.value === 'anim' ? '0' : '0,0' }); if (reference === undefined) return;
      try { const text = fs.readFileSync(filename, 'utf8'), next = appendUiElement(text, message.sectionLine, base, { kind: itemType.value, reference }); transactionalWrite(fs, filename, next, mutationOptions(filename, 'add-ui-element', { expectedHash: payload.sourceHash })); await populate(panel, filename, workspaceMode); } catch (error) { vscode.window.showErrorMessage(`Could not add UI element: ${error.message}`); } return;
    }
    if (message.type === 'openLuaModule' || message.type === 'openLuaStructure') {
      try {
        const target = await openOrCreateLuaModule(filename, message.type === 'openLuaModule');
        if (!target) return vscode.window.showWarningMessage('Create or assign a screenpack Lua module first.');
        const uri = vscode.Uri.file(target); await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.One });
        if (message.type === 'openLuaStructure') await vscode.commands.executeCommand('ikemen.codeStructure.openWorkspace', uri);
        else await populate(panel, filename, workspaceMode);
      } catch (error) { vscode.window.showErrorMessage(`Screenpack Lua module: ${error.message}`); }
      return;
    }
    if (message.type === 'openSource') {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
      const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
      const line = Math.max(0, Math.min(document.lineCount - 1, Number(message.line) || 0));
      editor.selection = new vscode.Selection(line, 0, line, 0);
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
      return;
    }
    if (message.type === 'openScreenpackSprite') {
      const target = screenpackSpriteHandoff(payload, message);
      if (!target) return vscode.window.showWarningMessage('The selected screenpack element changed. Refresh the workspace and choose it again.');
      if (!payload.sffPath || payload.sffError || !fs.existsSync(payload.sffPath)) return vscode.window.showWarningMessage('The screenpack SFF is not currently available. Review the workspace validation details.');
      if (hash(fs.readFileSync(filename, 'utf8')) !== payload.sourceHash) { await populate(panel, filename, workspaceMode, presetReference); return vscode.window.showWarningMessage('The screenpack changed on disk. The workspace was refreshed; choose the element again.'); }
      await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(target.sffPath), undefined, { group: target.group, number: target.number });
      return;
    }
    if (message.type === 'copyPatch') { await vscode.env.clipboard.writeText(String(message.text || '')); return vscode.window.showInformationMessage('UI position patch copied.'); }
    if (message.type === 'applySelectGrid') {
      if (workspaceMode !== 'select-layout') return;
      const values = message.values || {}, summary = `Rows ${values.gridRows} × columns ${values.gridColumns}; origin ${values.gridX}, ${values.gridY}; cell ${values.cellW}, ${values.cellH}; spacing ${values.spaceX}, ${values.spaceY}`;
      const answer = await vscode.window.showWarningMessage(`Apply Character Select grid settings?\n${summary}\n\nThis changes the motif screen layout. It does not change select.def or the roster.`, { modal: true }, 'Apply Layout');
      if (answer !== 'Apply Layout') return;
      try {
        let next = fs.readFileSync(filename, 'utf8');
        for (const [key, value] of [['rows', values.gridRows], ['columns', values.gridColumns], ['pos', `${values.gridX}, ${values.gridY}`], ['cell.size', `${values.cellW}, ${values.cellH}`], ['cell.spacing', `${values.spaceX}, ${values.spaceY}`]]) {
          const current = parseDef(next, filename), selectInfo = sections(current, 'Select Info')[0]; if (!selectInfo) throw new Error('The motif has no [Select Info] section.'); next = setSectionEntry(current, selectInfo.line, key, String(value));
        }
        const result = transactionalWrite(fs, filename, next, mutationOptions(filename, 'character-select-grid-layout', { expectedHash: payload.sourceHash })); await formDrafts.discard(screenpackDraftKey(filename,workspaceMode));await populate(panel, filename, workspaceMode); vscode.window.showInformationMessage(`Updated Character Select grid.${result.backup ? ` Backup: ${path.basename(result.backup)}` : ''}`);
      } catch (error) { vscode.window.showErrorMessage(`Could not update Character Select grid: ${error.message}`); }
      return;
    }
    if (message.type !== 'applyPosition') return;
    const answer = await vscode.window.showWarningMessage(`Apply ${message.key} = ${message.value} to ${message.name}?`, { modal: true }, 'Apply');
    if (answer !== 'Apply') return;
    try {
      const document = parseDef(fs.readFileSync(filename, 'utf8'), filename), next = setSectionEntry(document, Number(message.sectionLine), String(message.key), String(message.value));
      const result = transactionalWrite(fs, filename, next, mutationOptions(filename, 'ui-element-position', { expectedHash: payload.sourceHash })); await formDrafts.discard(screenpackDraftKey(filename,workspaceMode));await populate(panel, filename, workspaceMode); vscode.window.showInformationMessage(`Updated ${message.name} position.${result.backup ? ` Backup: ${path.basename(result.backup)}` : ''}`);
    } catch (error) { vscode.window.showErrorMessage(`Could not update UI position: ${error.message}`); }
  });
  panelMessageHandlers.set(panel, handler);
}

async function openUiWorkspace(uri, options = {}) {
  let filename = uri && uri.fsPath, workspaceMode = options.preset?options.reference?.workspaceMode||'screenpack':options.workspaceMode || 'screenpack';
  if (!filename) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) {
      try { if (['screenpack', 'lifebar'].includes(kind(parseDef(fs.readFileSync(active.fsPath, 'utf8'), active.fsPath)))) filename = active.fsPath; } catch (_) {}
    }
  }
  if (!filename) filename = await chooseFileOrFolder({ title: 'Open Screenpack or Fight UI', filters: { 'IKEMEN UI definition': ['def'] }, extensions: ['def'], predicate: (candidate) => ['screenpack', 'lifebar'].includes(kind(parseDef(fs.readFileSync(candidate, 'utf8'), candidate))), maxDepth: 4, invalidMessage: 'That DEF is not a screenpack or fight/lifebar definition.', emptyMessage: 'No screenpack or fight/lifebar DEF files were found in that folder.' });
  if (!filename) return;
  try {
    if (!['screenpack', 'lifebar'].includes(kind(parseDef(fs.readFileSync(filename, 'utf8'), filename)))) return vscode.window.showErrorMessage('Choose a screenpack system.def or fight/lifebar DEF.');
  } catch (error) { return vscode.window.showErrorMessage(`Could not read UI DEF: ${error.message}`); }
  if(options.preset&&(!options.reference||options.reference.sourceHash!==hash(fs.readFileSync(filename,'utf8'))))return;
  const existing = openPanels.get(panelKey(filename, workspaceMode));
  if (existing) { revealInViewerGroup(existing); return existing; }
  try { const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenUiWorkspace', `UI: ${path.basename(filename)}`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true })); await populate(panel, filename, workspaceMode,options.preset?options.reference:null);return panel; }
  catch (error) { vscode.window.showErrorMessage(`Could not open UI workspace: ${error.message}`); }
}

async function locateCharacterSelectMotif(source) {
  const filename = source && source.fsPath || source, root = filename && gameRoot(filename);
  if (!root) return null;
  const config = path.join(root, 'save', 'config.ini'), candidates = [];
  if (fs.existsSync(config)) {
    const match = /^\s*Motif\s*=\s*([^;\r\n]+)/im.exec(fs.readFileSync(config, 'utf8'));
    if (match) { const reference = match[1].trim().replace(/^["']|["']$/g, ''); const configured = path.resolve(root, reference.replace(/[\\/]/g, path.sep)); if (fs.existsSync(configured)) return configured; candidates.push(configured); }
  }
  candidates.push(path.join(root, 'data', 'system.def'), path.join(root, 'data', 'ikemen1', 'system.def'), path.join(root, 'data', 'system.base.def'));
  const valid = [...new Set(candidates)].filter((item) => fs.existsSync(item));
  if (valid.length <= 1) return valid[0] || null;
  const picked = await vscode.window.showQuickPick(valid.map((item) => ({ label: path.relative(root, item), description: item, filename: item })), { title: 'Character Select Layout Builder', placeHolder: 'Choose the motif whose [Select Info] layout you want to edit' });
  return picked && picked.filename;
}

async function openSelectLayoutBuilder(uri) {
  const filename = await locateCharacterSelectMotif(uri || vscode.window.activeTextEditor?.document.uri);
  if (!filename) return vscode.window.showWarningMessage('The active IKEMEN motif could not be located. Open its system.def with the Screenpack workspace instead.');
  const answer = await vscode.window.showWarningMessage(`Enter Character Select Layout Builder?\n\nMotif: ${filename}\n\nThis advanced mode edits [Select Info] presentation. Use the normal select.def editor for roster, stages, and arcade order.`, { modal: true }, 'Enter Layout Builder');
  if (answer !== 'Enter Layout Builder') return;
  return openUiWorkspace(vscode.Uri.file(filename), { workspaceMode: 'select-layout' });
}

async function generateCharacterUiBridge(uri) {
  let filename = uri && uri.fsPath;
  if (!filename) { const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri; if (active && /\.def$/i.test(active.fsPath)) filename = active.fsPath; }
  let model = { name: '', localCoord: [320, 240] };
  if (filename) try { model = screenpackModel(parseDef(fs.readFileSync(filename, 'utf8'), filename)); } catch (_) {}
  const prefix = await vscode.window.showInputBox({ title: 'Character UI function prefix', value: 'ProjectUI_', prompt: 'Use the project namespace used by your shared character code.' });
  if (prefix === undefined) return;
  const message = await vscode.window.showInputBox({ title: 'Example LifebarAction message', value: 'ACTION', prompt: 'This is only included in a commented example call.' });
  if (message === undefined) return;
  const content = characterUiBridge({ prefix, fightName: model.name, localCoord: model.localCoord, message });
  const document = await vscode.workspace.openTextDocument({ language: 'zss', content });
  await vscode.window.showTextDocument(document, { preview: false });
}

async function createUiPreviewProfile(uri) {
  const active = uri && uri.fsPath || vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath;
  const root = active && gameRoot(active);
  const defaultUri = root ? vscode.Uri.file(path.join(root, '.ikemen', 'ui-preview-profiles.json')) : vscode.workspace.workspaceFolders && vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.ikemen', 'ui-preview-profiles.json');
  const target = await vscode.window.showSaveDialog({ title: 'Save optional UI preview profile', defaultUri, filters: { 'JSON data': ['json'] } });
  if (!target) return;
  if (fs.existsSync(target.fsPath)) {
    const answer = await vscode.window.showWarningMessage('The preview profile already exists. Replace it?', { modal: true }, 'Replace');
    if (answer !== 'Replace') return;
  }
  transactionalWrite(fs, target.fsPath, `${JSON.stringify(previewProfile(), null, 2)}\n`, mutationOptions(target.fsPath, 'ui-preview-profile', { allowExisting: true }));
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target), { preview: false });
}

function registerScreenpackWorkspace(context) {
  formDrafts=new FormDrafts(context.workspaceState,'ikemaker.screenpackDrafts.v1');context.subscriptions.push(vscode.commands.registerCommand('ikemen.ui.openWorkspace', openUiWorkspace), vscode.commands.registerCommand('ikemen.selectDef.openLayoutBuilder', openSelectLayoutBuilder), vscode.commands.registerCommand('ikemen.ui.openLuaModule', async (uri) => { const filename = uri && uri.fsPath || vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath; if (!filename || !/\.def$/i.test(filename)) return vscode.window.showWarningMessage('Open a screenpack DEF first.'); try { const target = await openOrCreateLuaModule(filename, true); if (target) await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false }); } catch (error) { vscode.window.showErrorMessage(`Screenpack Lua module: ${error.message}`); } }), vscode.commands.registerCommand('ikemen.ui.generateCharacterBridge', generateCharacterUiBridge), vscode.commands.registerCommand('ikemen.ui.createPreviewProfile', createUiPreviewProfile), vscode.window.registerWebviewPanelSerializer('ikemenUiWorkspace', { async deserializeWebviewPanel(panel, state) { if (!state || !state.filename || !fs.existsSync(state.filename)) { panel.dispose(); return; } try { await populate(panel, state.filename, state.workspaceMode || 'screenpack'); } catch (error) { panel.dispose(); vscode.window.showErrorMessage(`Could not restore UI workspace: ${error.message}`); } } }));
}

module.exports = { registerScreenpackWorkspace, openUiWorkspace, openSelectLayoutBuilder, locateCharacterSelectMotif, openOrCreateLuaModule, luaModuleTemplate, generateCharacterUiBridge, createUiPreviewProfile, embeddedActions, uiPayload, uiHtml, screenpackSpriteHandoff, safeScreenpackDraft, recoveryClientScript };
