'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { openViewerSource, currentPoint } = require('./viewer_navigation');
const { parseDef, setSectionEntry } = require('./def_model');
const { storyboardModel, appendScene, duplicateScene, deleteScene, appendLayer } = require('./storyboard_model');
const { transactionalWrite, optionsFromConfig, hash } = require('./mutation_safety');
const { chooseFileOrFolder } = require('./open_target_picker');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { registerAuthoringPanel } = require('./authoring_context_registry');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');

let formDrafts=new (require('./form_drafts').FormDrafts)();
const draftKey=(file,scene)=>file.toLowerCase()+'#'+scene;
function payload(filename) { const text = fs.readFileSync(filename, 'utf8'); return { filename, drafts:Object.fromEntries(storyboardModel(parseDef(text,filename)).scenes.map(scene=>[scene.number,formDrafts.read(draftKey(filename,scene.number))])), sourceHash: hash(text), model: { ...storyboardModel(parseDef(text, filename)), source: undefined } }; }
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function html(data) { return `<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font:12px var(--vscode-font-family)}header{height:42px;display:flex;align-items:center;gap:7px;padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border)}button,input{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px}.app{height:calc(100vh - 42px);display:grid;grid-template-columns:240px 1fr 290px}.side{padding:10px;overflow:auto;background:var(--vscode-sideBar-background)}.left{border-right:1px solid var(--vscode-panel-border)}.right{border-left:1px solid var(--vscode-panel-border)}.scene{padding:8px;border:1px solid transparent;cursor:pointer}.scene.active{border-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground)}main{display:grid;place-items:center;overflow:hidden}.canvas{width:min(90%,960px);aspect-ratio:var(--ratio);background:rgb(var(--clear));border:1px solid #556;position:relative}.layer{position:absolute;transform:translate(-50%,-50%);padding:8px 12px;border:1px dashed #63d6d6;background:#18333a99;white-space:pre-wrap}.row{display:grid;grid-template-columns:95px 1fr;gap:7px;margin:7px 0}.toolbar{display:flex;gap:5px;flex-wrap:wrap}.muted{color:var(--vscode-descriptionForeground)}h2{font-size:12px;text-transform:uppercase}.danger{color:#ff8585}header{height:auto;min-height:42px;flex-wrap:wrap}header>.muted{overflow-wrap:anywhere;min-width:0;flex:1 1 180px}header button{white-space:normal}.app{height:auto;min-height:calc(100vh - 42px);grid-template-columns:220px minmax(0,1fr) 290px}.app>*{min-width:0}.row{grid-template-columns:95px minmax(0,1fr)}input{width:100%;min-width:0}button{max-width:100%}main{min-height:350px;padding:16px;overflow:auto}.canvas{width:100%;max-width:960px}.side{overflow-wrap:anywhere}.scene{width:100%;text-align:left;display:block}.scene:focus-visible{outline:2px solid var(--vscode-focusBorder)}@media(max-width:850px){.app{display:flex;flex-direction:column}.side{overflow:visible}.left,.right{border:0;border-bottom:1px solid var(--vscode-panel-border)}main{min-height:260px}.canvas{width:min(100%,640px)}header>span[style]{display:none}}</style></head><body><header><b>STORYBOARD EDITOR</b><span class="muted">${escapeHtml(path.basename(data.filename))}</span><span style="flex:1"></span>${launchControlsHtml('storyboard')}<button id="source">Open source</button><button id="refresh">Refresh</button></header><div class="app"><aside class="side left"><div class="toolbar"><button id="add">+ Scene</button><button id="duplicate">Duplicate</button><button id="remove" class="danger">Remove</button></div><h2>Scenes</h2><div id="scenes"></div><details><summary>Opening, ending, and storyboard help</summary><p class="muted">Scenes play in numeric order. Each scene may contain sprite, animation, or text layers, music, fades, and a duration. Character DEF files can assign opening and ending storyboards; system.def can assign logo, game intro, loading, game-over, default ending, and credits.</p></details></aside><main><div class="canvas" id="canvas"></div></main><aside class="side right"><h2>Selected scene</h2><div id="info"></div><div class="row"><label for="duration">Duration</label><input id="duration" type="number" min="1"></div><div class="row"><label for="color">Clear color</label><input id="color" placeholder="0,0,0"></div><button id="apply">Apply scene changes</button><h2>Layers</h2><button id="addLayer">+ Sprite, animation, or text layer</button><div id="layers"></div><p class="muted">Detailed animation timing remains editable in the visible DEF source. The preview shows layer positions and references; use the game to check rendered sprites, fonts, animation, and timing.</p></aside></div><script>const vscode=acquireVsCodeApi();let data=${safe(data)},model=data.model,$=id=>document.getElementById(id);const saved=vscode.getState();let selected=Math.max(0,Math.min(model.scenes.length-1,saved?.filename===data.filename?Number(saved.selected)||0:0));function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function current(){return model.scenes[selected]}function render(){const s=current();vscode.setState({...vscode.getState(),filename:data.filename,selected});['duplicate','remove','addLayer','apply'].forEach(id=>$(id).disabled=!s);$('scenes').innerHTML=model.scenes.map((x,i)=>'<button class="scene '+(i===selected?'active':'')+'" data-i="'+i+'" aria-pressed="'+(i===selected)+'"><b>Scene '+x.number+'</b><br><span class="muted">'+x.endTime+' ticks · '+x.layers.length+' layer(s)</span></button>').join('')||'<p class="muted">No scenes yet. Select + Scene.</p>';document.querySelectorAll('[data-i]').forEach(x=>x.onclick=()=>{selected=Number(x.dataset.i);render()});if(!s){$('info').textContent='Create the first scene to begin.';$('canvas').innerHTML='';$('layers').innerHTML='';$('duration').value='';$('color').value='';return}$('info').innerHTML='<div class="row"><span>Number</span><b>'+s.number+'</b></div><div class="row"><span>Start scene</span><span>'+model.startScene+'</span></div>';$('duration').value=s.endTime;$('color').value=s.clearColor.join(',');globalThis.restoreSceneDraft?.();$('canvas').style.setProperty('--ratio',model.localCoord[0]+'/'+model.localCoord[1]);$('canvas').style.setProperty('--clear',s.clearColor.join(','));$('canvas').innerHTML=s.layers.map(l=>'<div class="layer" style="left:'+(l.position[0]/model.localCoord[0]*100)+'%;top:'+(l.position[1]/model.localCoord[1]*100)+'%">Layer '+l.index+'<br>'+(l.text?esc(l.text):l.sprite?'Sprite '+l.sprite.join(','):l.animation!==null?'Animation '+l.animation:'Visual layer')+'</div>').join('');$('layers').innerHTML=s.layers.map(l=>'<div class="scene"><b>Layer '+l.index+'</b><br><span class="muted">'+(l.text?esc(l.text):l.sprite?'sprite '+l.sprite.join(','):l.animation!==null?'animation '+l.animation:'configured layer')+' · '+l.position.join(', ')+'</span></div>').join('')||'<p class="muted">No layer fields in this scene.</p>';vscode.setState({...vscode.getState(),filename:data.filename,selected})}$('refresh').onclick=()=>vscode.postMessage({type:'refresh'});$('add').onclick=()=>vscode.postMessage({type:'addScene'});$('duplicate').onclick=()=>current()&&vscode.postMessage({type:'duplicateScene',line:current().line});$('remove').onclick=()=>current()&&vscode.postMessage({type:'removeScene',line:current().line,number:current().number});$('addLayer').onclick=()=>current()&&vscode.postMessage({type:'addLayer',line:current().line,index:current().layers.length?Math.max(...current().layers.map(x=>x.index))+1:0});$('source').onclick=()=>vscode.postMessage({type:'source',line:current()?.line||0,navigationSelection:globalThis.ikemenNavigationSelection()});$('apply').onclick=()=>current()&&vscode.postMessage({type:'apply',line:current().line,sceneNumber:current().number,draft:sceneDraftSnapshot(),duration:$('duration').value,color:$('color').value});${require('./storyboard_drafts').clientScript()}render();${require('./storyboard_navigation').clientScript()}${launchControlsClientScript()}</script></body></html>`; }
function mutationOptions(filename, label, expectedHash) { return optionsFromConfig(vscode, filename, label, { journalRoot: path.dirname(filename), expectedHash }); }

const openPanels = new Map();
function panelKey(filename) { return path.resolve(filename).toLowerCase(); }
function validateSceneValues(duration, color) {
  const ticks = Number(duration), rgb = String(color).split(',').map(x => x.trim());
  if (!Number.isSafeInteger(ticks) || ticks < 1) throw new Error('Duration must be a positive whole number of ticks.');
  if (rgb.length !== 3 || rgb.some(x => !/^\d+$/.test(x) || Number(x) > 255)) throw new Error('Clear color must contain three whole numbers from 0 to 255, separated by commas.');
  return { duration: String(ticks), color: rgb.map(Number).join(',') };
}
async function populate(panel, filename) {
  let data = payload(filename), busy = false,disposed=false;
  panel.webview.options = { enableScripts: true };
  const refresh = () => { data = payload(filename); panel.webview.postMessage({type:'storyboardModel',data}); };
  const key = panelKey(filename);
  openPanels.set(key, panel);
  trackViewerPanel(panel);
  require('./viewer_close').support(panel,{isBusy:()=>busy,keepDraft:()=>formDrafts.flush()});
  registerAuthoringPanel(panel, { type:'storyboard', key:filename, label:path.basename(filename), root:path.dirname(filename), files:[filename] });
  panel.webview.html=require('./webview_policy').protect(html(data),panel.webview.cspSource);
  const disposable = panel.webview.onDidReceiveMessage(async message => {
    if(['sceneDraft','discardSceneDraft'].includes(message.type)){
      if(!Number.isInteger(message.sceneNumber))return;
      try{const key=draftKey(filename,message.sceneNumber);if(message.type==='discardSceneDraft')await formDrafts.discard(key);else if(message.draft&&typeof message.draft.duration==='string'&&typeof message.draft.color==='string')await formDrafts.stage(key,message.draft);}
      catch(error){vscode.window.showErrorMessage('Storyboard draft could not be stored for reopening: '+error.message);}return;
    }
    if(disposed)return;
    if(await handleLaunchMessage(message, filename, 'storyboard', panel))return;
    if (busy) return;
    busy = true;
    try {
      if (message.type === 'refresh') { refresh(); return; }
      if (message.type === 'source') {
        await openViewerSource(filename, message.line, currentPoint(filename, 'storyboard', message, panel));
        return;
      }
      if (!['addScene','duplicateScene','addLayer','removeScene','apply'].includes(message.type)) return;
      if ((vscode.workspace.textDocuments || []).some(doc => doc.isDirty && panelKey(doc.uri.fsPath) === key)) throw new Error('Save or undo the unsaved DEF source changes, then select Refresh before editing the storyboard.');
      const text = fs.readFileSync(filename, 'utf8');
      if (hash(text) !== data.sourceHash) throw new Error('The storyboard changed outside this editor. Select Refresh to load the latest file before trying again.');
      const model = storyboardModel(parseDef(text));
      const scene = model.scenes.find(x => x.line === Number(message.line));
      if (message.type !== 'addScene' && !scene) throw new Error('The selected scene no longer exists. Select Refresh and choose a scene.');
      let next = text, label = '';
      if (message.type === 'addScene' || message.type === 'duplicateScene') {
        const number = model.scenes.length ? Math.max(...model.scenes.map(x => x.number)) + 1 : 0;
        next = message.type === 'addScene' ? appendScene(text, number) : duplicateScene(text, scene.line, number);
        label = `${message.type === 'addScene' ? 'add' : 'duplicate'}-storyboard-scene-${number}`;
      }
      if (message.type === 'addLayer') {
        const kind = await vscode.window.showQuickPick([{label:'Sprite layer',value:'sprite'},{label:'Animation layer',value:'animation'},{label:'Text layer',value:'text'}], {title:'Storyboard layer type'});
        if (!kind||disposed) return;
        let reference = '', layerText = '';
        if (kind.value === 'text') layerText = await vscode.window.showInputBox({title:'Layer text',value:'New text',validateInput:value => /[\r\n]/.test(value) ? 'Enter one line of text.' : undefined});
        else reference = await vscode.window.showInputBox({title:kind.value === 'animation' ? 'Animation number' : 'Sprite group,index',value:kind.value === 'animation' ? '0' : '0,0',validateInput:value => (kind.value === 'animation' ? /^\d+$/ : /^\d+\s*,\s*\d+$/).test(value.trim()) ? undefined : 'Enter non-negative whole numbers.'});
        if ((kind.value === 'text' && layerText === undefined) || (kind.value !== 'text' && reference === undefined)) return;
        const index = scene.layers.length ? Math.max(...scene.layers.map(x => x.index)) + 1 : 0;
        next = appendLayer(text, scene.line, {index,kind:kind.value,reference,text:layerText});
        label = `add-storyboard-layer-${index}`;
      }
      if (message.type === 'removeScene') {
        const answer = await vscode.window.showWarningMessage(`Remove Scene ${scene.number}?`, {modal:true,detail:'This removes the scene and discards its unapplied scene draft.'}, 'Remove Scene');
        if (answer !== 'Remove Scene') return;
        next = deleteScene(text, scene.line); label = `remove-storyboard-scene-${scene.number}`;
      }
      if (message.type === 'apply') {
        const values = validateSceneValues(message.duration, message.color);
        if(message.sceneNumber!==scene.number||message.draft?.baseDuration!==String(scene.endTime)||message.draft?.baseColor!==scene.clearColor.join(','))throw new Error('The scene values changed since this draft. Refresh and review or discard the retained draft.');
        next = setSectionEntry(parseDef(text,filename), scene.line, 'end.time', values.duration);
        next = setSectionEntry(parseDef(next,filename), scene.line, 'clearcolor', values.color);
        label = 'edit-storyboard-scene';
      }
      if (!label) return;
      if(disposed)return;
      if((vscode.workspace.textDocuments||[]).some(doc=>doc.isDirty&&panelKey(doc.uri.fsPath)===key))throw new Error('The DEF source now has unsaved edits. Save or undo them, then refresh before applying.');
      transactionalWrite(fs, filename, next, mutationOptions(filename, label, data.sourceHash));
      if(message.type==='removeScene'){try{await formDrafts.discard(draftKey(filename,scene.number));}catch(error){vscode.window.showErrorMessage('The scene was removed, but clearing its recovery draft failed: '+error.message);}await panel.webview.postMessage({type:'sceneDraftRemoved',sceneNumber:scene.number});}
      if(message.type==='apply'){try{await formDrafts.discard(draftKey(filename,scene.number),message.draft);}catch(error){vscode.window.showErrorMessage('The scene was saved, but clearing its recovery draft failed: '+error.message);}await panel.webview.postMessage({type:'sceneDraftApplied',sceneNumber:scene.number,draft:message.draft});}
      refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Storyboard: ${error.message}`);
    } finally { busy = false; }
  });
  panel.onDidDispose(() => { disposed=true;disposable.dispose(); if (openPanels.get(key) === panel) openPanels.delete(key); });
}
async function openStoryboardWorkspace(uri) {
  let panel;
  try {
    let filename = uri && uri.fsPath;
    if (!filename) filename = await chooseFileOrFolder({title:'Open IKEMEN Storyboard',filters:{'IKEMEN storyboard':['def']},extensions:['def'],predicate:candidate => fs.readFileSync(candidate,'utf8').match(/^\s*\[SceneDef\]/im),maxDepth:4,invalidMessage:'That DEF is not an IKEMEN storyboard.',emptyMessage:'No storyboard DEF files were found.'});
    if (!filename) return;
    const existing = openPanels.get(panelKey(filename));
    if (existing) { revealInViewerGroup(existing); return existing; }
    if (!/^\s*\[SceneDef\]/im.test(fs.readFileSync(filename,'utf8'))) throw new Error('That DEF is not an IKEMEN storyboard.');
    panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenStoryboardWorkspace', `Storyboard: ${path.basename(filename)}`, preferredViewerColumn(vscode.ViewColumn.Active), {enableScripts:true,retainContextWhenHidden:true}));
    await populate(panel, filename);
    return panel;
  } catch (error) { if (panel) panel.dispose(); await vscode.window.showErrorMessage(`Could not open storyboard: ${error.message}`); }
}
function registerStoryboardWorkspace(context) {
  formDrafts=new (require('./form_drafts').FormDrafts)(context.workspaceState,'ikemaker.storyboardDrafts.v1');
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.storyboard.open',openStoryboardWorkspace),vscode.window.registerWebviewPanelSerializer('ikemenStoryboardWorkspace', {
    async deserializeWebviewPanel(panel,state) {
      if (!state?.filename || !fs.existsSync(state.filename)) { panel.dispose(); return; }
      const existing = openPanels.get(panelKey(state.filename));
      if (existing && existing !== panel) { panel.dispose(); revealInViewerGroup(existing); return; }
      try { await populate(panel,state.filename); }
      catch (error) { panel.dispose(); await vscode.window.showErrorMessage(`Could not restore storyboard: ${error.message}`); }
    }
  }));
}
module.exports = { registerStoryboardWorkspace, openStoryboardWorkspace, payload, html, validateSceneValues };
