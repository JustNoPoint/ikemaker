'use strict';

const fs = require('fs');
const path = require('path');
const origins = new Map(), sourcePanels = new Map();
const archiveContexts=new Map();
let archiveContextStore;
function archiveContext(filename) {
  const identity=assetKey(filename);
  if(!archiveContexts.has(identity)){const restored=archiveContextStore?.restore(filename);if(restored)archiveContexts.set(identity,restored);}
  return archiveContexts.get(identity);
}
function archiveRegistry(def) {
  const vscode=require('vscode');
  const extraDefs=vscode.workspace.getConfiguration?.('ikemenZss',vscode.Uri.file(def))?.get('viewerSharedFxDefs',[])||[];
  return require('./viewer_archive_registry').collect(def,{extraDefs,readText:file=>vscode.workspace.textDocuments.find(doc=>assetKey(doc.fileName)===assetKey(file))?.getText()||fs.readFileSync(file,'utf8')});
}
function sendArchiveContext(panel,filename) {
  const context=archiveContext(filename);
  panel.webview.postMessage({type:'viewerArchiveContext',label:context?(context.invalid?'Shared context needs review':'Shared '+context.prefix.toUpperCase())+' · '+path.basename(filename):'',detail:context?filename+'\nOwner: '+context.ownerDef+'\n'+context.record.source:''});
}
async function rememberArchive(filename,context) {
  await archiveContextStore?.remember(filename,context);
  if(context)archiveContexts.set(assetKey(filename),context);else archiveContexts.delete(assetKey(filename));
  for(const [panel,key] of sourcePanels)if(key===assetKey(filename))sendArchiveContext(panel,filename);
}
const assetKey = filename => filename ? path.resolve(filename).toLowerCase() : '';
const restores=new Map(),readyWaiters=new Map();let restoreId=0;
function panelReady(panel) {
  if(sourcePanels.has(panel))return Promise.resolve(true);
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{readyWaiters.delete(panel);resolve(false);},5000);
    readyWaiters.set(panel,()=>{clearTimeout(timer);readyWaiters.delete(panel);resolve(true);});
  });
}
function referenceExists(filename,kind,reference) {
  if(kind==='commands'){
    if(!reference)return false;
    const read=file=>require('vscode').workspace.textDocuments.find(doc=>assetKey(doc.fileName)===assetKey(file))?.getText()??fs.readFileSync(file,'utf8');
    const files=require('./command_movelist_workspace').contextFiles(filename,read);
    if(reference.tab==='movelist')return !!files.movelistFile&&assetKey(reference.file)===assetKey(files.movelistFile)&&fs.existsSync(files.movelistFile);
    if(!files.commandFile||assetKey(reference.file)!==assetKey(files.commandFile))return false;
    return !!require('./command_movelist_navigation').findCommand(require('./command_movelist_model').parseCommands(read(files.commandFile),files.commandFile).commands,reference);
  }
  if(kind==='stage'&&reference){
    const document=require('vscode').workspace.textDocuments.find(doc=>assetKey(doc.fileName)===assetKey(filename));
    const text=document?document.getText():fs.readFileSync(filename,'utf8');
    const model=require('./stage_model').stageModel(require('./def_model').parseDef(text));
    return !!require('./stage_navigation').findBackground(model.backgrounds,reference);
  }
  if(kind==='code'&&reference){
    const document=require('vscode').workspace.textDocuments.find(doc=>assetKey(doc.fileName)===assetKey(filename));
    const text=document?document.getText():fs.readFileSync(filename,'utf8');
    const model=require('./code_structure_model');
    const language=/\.lua$/i.test(filename)?'lua':/\.cns$/i.test(filename)?'cns':'zss';
    const lines=text.split(/\r?\n/),nodes=model.flatten(model.parseCodeStructure(text,language,filename));
    for(const node of nodes)node.sourceExcerpt=lines.slice(node.startLine,Math.min(node.endLine+1,node.startLine+10)).join('\n');
    return !!require('./code_structure_navigation').findBlock(nodes,reference);
  }
  if(kind==='storyboard'&&reference){
    const document=require('vscode').workspace.textDocuments.find(doc=>assetKey(doc.fileName)===assetKey(filename));
    const text=document?document.getText():fs.readFileSync(filename,'utf8');
    const scenes=require('./storyboard_model').storyboardModel(require('./def_model').parseDef(text)).scenes;
    return Number.isInteger(reference.sceneNumber)&&scenes.filter(scene=>scene.number===reference.sceneNumber).length===1;
  }
  if(!Number.isInteger(reference?.group))return true;
  if(kind==='air'){
    const document=require('vscode').workspace.textDocuments.find(doc=>assetKey(doc.fileName)===assetKey(filename));
    const action=require('./air_preview_model').parseAir(document?document.getText():fs.readFileSync(filename,'utf8')).find(item=>item.number===reference.group);
    return Boolean(action && (!Number.isInteger(reference.frameIndex)||reference.frameIndex>=0&&reference.frameIndex<action.frames.length));
  }
  if(kind==='sff')return require('./sff_reader').readSff(filename).sprites.some(item=>item.group===reference.group&&item.number===reference.number);
  if(kind==='snd')return require('./snd_reader').readSnd(filename).entries.some(item=>item.group===reference.group&&item.index===reference.number);
  return true;
}
function acknowledgeRestore(panel,message) {
  const pending=restores.get(message.requestId);
  if(pending?.panel===panel){restores.delete(message.requestId);clearTimeout(pending.timer);pending.resolve(message.ok===true);}
}
function restorePanel(panel,point) {
  return new Promise(resolve=>{
    const requestId=++restoreId;
    const timer=setTimeout(()=>{restores.delete(requestId);resolve(false);},5000);
    restores.set(requestId,{panel,resolve,timer});
    Promise.resolve(panel.webview.postMessage({type:'viewerHistoryRestore',requestId,kind:point.kind,reference:point.reference})).catch(()=>acknowledgeRestore(panel,{requestId,ok:false}));
  });
}
const history = require('./viewer_history').createHistory(openHistoryPoint, state => {
  for(const panel of sourcePanels.keys())panel.webview.postMessage({type:'viewerHistoryState',...state});
});
function viewerPoint(filename,kind,reference,panel) {return {filename:path.resolve(filename),kind,reference,panel,archiveContext:archiveContext(filename)};}
function currentPoint(filename,kind,message,panel) {
  return viewerPoint(filename,kind,message?.navigationSelection,panel);
}
async function openPresetPoint(point, column, onRestored) {
  const vscode = require('vscode');
  if (!fs.existsSync(point.filename)) return false;
  let context;
  if(point.archiveContext){
    const saved=point.archiveContext;
    context=require('./viewer_archive_context').createStore({get:()=>({[assetKey(point.filename)]:saved})},(def,prefix,kind)=>require('./viewer_archive_registry').resolveReference(archiveRegistry(def),prefix,kind).candidates).restore(point.filename);
    if(!context||context.invalid)return false;
  }
  if (point.reference && !referenceExists(point.filename, point.kind, point.reference)) return false;
  let opened;
  if (point.kind === 'air') opened = await require('./air_viewer').openAirPreview(vscode.Uri.file(point.filename), {preserveFocus:true,action:point.reference?.group});
  else {
    const command = {workflow:'ikemen.productionWorkflow.open',roster:'ikemen.selectDef.openWorkspace',health:'ikemen.characterHealth.open',connections:'ikemen.characterDependencies.open',tests:'ikemen.testSessions.open',project_manager:'ikemen.projectManager.open',mutation_history:'ikemen.mutations.openHistory',cns_converter:'ikemen.cnsConverter.open',menu_modes:'ikemen.menuModes.openCreator',story_dialogue:'ikemen.storyDialogue.openCreator',palette_index_organizer:'ikemen.paletteOrganizer.open',artist_intake:'ikemen.artistIntake.open',sff_assembly:'sff.openAssembly',move_lab:'ikemen.moveLab.open',spatial_composer:'ikemen.explodComposer.open',helper:'ikemen.helperLab.open',throw_creator:'ikemen.throwCreator.open',hitdef:'ikemen.hitDef.openEditor',palfx_editor:'zss.openPalFxEditor',screenpack:'ikemen.ui.openWorkspace',sff:'sff.openViewer',snd:'snd.openViewer',constants:'ikemen.moveConstants.open',storyboard:'ikemen.storyboard.open',code:'ikemen.codeStructure.openWorkspace',stage:'ikemen.stage.openWorkspace',commands:'ikemen.commandMovelist.openEditor'}[point.kind];
    if (!command) return false;
    opened = await vscode.commands.executeCommand(command, vscode.Uri.file(point.filename), ['roster','workflow','cns_converter','menu_modes','story_dialogue','palette_index_organizer','artist_intake','sff_assembly','move_lab','spatial_composer','helper','throw_creator','hitdef','palfx_editor','screenpack'].includes(point.kind)?{reference:point.reference,preset:true}:point.kind === 'health' ? {reference:point.reference} : point.kind === 'constants' ? {history:true} : ['sff','snd'].includes(point.kind) ? column : undefined, point.reference);
  }
  if (!opened) return false;
  const panel = opened.panel || opened;
  if (!await panelReady(panel)) return false;
  if (point.reference && !await restorePanel(panel,point)) return false;
  await rememberArchive(point.filename,context);
  panel.reveal(column,true);
  if(onRestored)onRestored(panel);
  return true;
}
async function openHistoryPoint(point) {
  const vscode=require('vscode');
  if(!fs.existsSync(point.filename)){vscode.window.showInformationMessage('This history file is no longer available: '+point.filename);return false;}
  if(point.kind==='source')return openSource(point);
  if(!referenceExists(point.filename,point.kind,point.reference)){vscode.window.showInformationMessage('The selected history item no longer exists in '+path.basename(point.filename)+'.');return false;}
  if(point.panel && sourcePanels.get(point.panel)===assetKey(point.filename)) {
    point.panel.reveal(undefined,false);
    const ok=await restorePanel(point.panel,point);
    if(ok)await rememberArchive(point.filename,point.archiveContext);
    if(!ok)vscode.window.showInformationMessage('The history item could not be selected. It may have changed, or the viewer has an unapplied edit.');
    return ok;
  }
  let opened;
  if(point.kind==='air')opened=await require('./air_viewer').openAirPreview(vscode.Uri.file(point.filename),{preserveFocus:false,action:point.reference?.group});
  const command={sff:'sff.openViewer',snd:'snd.openViewer',constants:'ikemen.moveConstants.open',storyboard:'ikemen.storyboard.open',code:'ikemen.codeStructure.openWorkspace',stage:'ikemen.stage.openWorkspace',commands:'ikemen.commandMovelist.openEditor'}[point.kind];
  if(command)opened=await vscode.commands.executeCommand(command,vscode.Uri.file(point.filename),point.kind==='constants'?{history:true}:undefined,point.reference);
  if(opened){const panel=opened.panel||opened,ok=await panelReady(panel)&&await restorePanel(panel,point);if(ok)await rememberArchive(point.filename,point.archiveContext);return ok;}
  if(command||point.kind==='air')return false;
  vscode.window.showInformationMessage('This workspace was closed. Reopen it before continuing this history path.');return false;
}
async function travelHistory(delta,point) {
  try{return await history.travel(delta,point);}
  catch(error){require('vscode').window.showErrorMessage('Could not restore viewer history: '+error.message);return false;}
}
function locateOrigin(text, origin) {
  const lines=String(text).split(/\r?\n/);
  if(lines[origin.line]===origin.text)return origin.line;
  const matches=lines.map((line,index)=>line===origin.text?index:-1).filter(index=>index>=0);
  return matches.length===1?matches[0]:-1;
}
function rememberSource(filename, origin) {
  if(!filename || !origin?.filename || !Number.isInteger(origin.line) || typeof origin.text!=='string')return;
  origins.set(assetKey(filename),{...origin});
  for(const [panel,key] of sourcePanels)if(key===assetKey(filename))panel.webview.postMessage({type:'viewerSourceAvailable',available:true,label:path.basename(origin.filename)+':'+(origin.line+1)});
}
function registerSourcePanel(panel, filename) {
  if(!panel?.webview)return;
  if(!sourcePanels.has(panel))panel.onDidDispose?.(()=>sourcePanels.delete(panel));
  require('./viewer_sessions').updateSource(panel,filename);
  const key=assetKey(filename);sourcePanels.set(panel,key);const origin=origins.get(key);
  readyWaiters.get(panel)?.();
  panel.webview.postMessage({type:'viewerSourceAvailable',available:Boolean(origin),label:origin?path.basename(origin.filename)+':'+(origin.line+1):''});
  panel.webview.postMessage({type:'viewerHistoryState',...history.state()});
  sendArchiveContext(panel,filename);
}
async function backToSource(filename,point) {
  const vscode=require('vscode'),origin=origins.get(assetKey(filename));
  if(!origin)return vscode.window.showInformationMessage('Open this viewer from a code reference to use Back to Source.');
  if(await openSource(origin)!==false)history.transition(point||viewerPoint(filename,path.extname(filename).slice(1)),{...origin,kind:'source'});
}
async function openSource(origin) {
  const vscode=require('vscode');
  if(!fs.existsSync(origin.filename)){vscode.window.showInformationMessage('The originating source file is no longer available.');return false;}
  const document=await vscode.workspace.openTextDocument(origin.filename),line=locateOrigin(document.getText(),origin);
  if(line<0){vscode.window.showInformationMessage('The originating line changed or became ambiguous. Open the source through Text Editors and choose the intended line.');return false;}
  const character=Math.min(origin.character||0,document.lineAt(line).text.length);
  const visible=(vscode.window.visibleTextEditors||[]).find(editor=>assetKey(editor.document?.fileName)===assetKey(origin.filename));
  const existingGroup=(vscode.window.tabGroups?.all||[]).find(group=>(group.tabs||[]).some(tab=>assetKey((tab.input?.uri||tab.input?.modified||tab.input?.original)?.fsPath)===assetKey(origin.filename)));
  const viewColumn=visible?.viewColumn||existingGroup?.viewColumn||origin.viewColumn||vscode.ViewColumn?.Beside;
  await vscode.window.showTextDocument(document,{preview:false,preserveFocus:false,viewColumn,selection:new vscode.Range(line,character,line,character)});
  return true;
}
async function openViewerSource(filename, requestedLine, fromPoint) {
  const vscode=require('vscode');
  if(!fs.existsSync(filename)){vscode.window.showInformationMessage('The source file is no longer available.');return false;}
  const document=await vscode.workspace.openTextDocument(filename);
  const lines=document.getText().split(/\r?\n/);
  const value=Number(requestedLine);
  const line=Math.max(0,Math.min(lines.length-1,Number.isFinite(value)?Math.trunc(value):0));
  return openReferenceSource({filename,line,character:0,text:lines[line]},fromPoint);
}
async function openReferenceSource(origin,fromPoint) {
  const ok=await openSource(origin);
  if(ok)history.transition(fromPoint,{...origin,kind:'source'});
  return ok;
}

function fitSprite(sprite, width, height) {
  const scale = Math.min(8, Math.max(0.001, Math.min(Math.max(1, width - 80) / Math.max(1, sprite.width), Math.max(1, height - 80) / Math.max(1, sprite.height))));
  return { scale, x: (sprite.axisX - sprite.width / 2) * scale, y: (sprite.axisY - sprite.height / 2) * scale };
}

// Only accept complete static references. Expressions and shared prefixes need
// an explicit choice of archive; silently assuming the character is incorrect.
function referenceAt(text, line) {
  const lines = String(text).split(/\r?\n/), raw = (lines[line] || '').replace(/\/\/.*$/, '').trim();
  if (/^[;#]/.test(raw)) return null;
  let kind = '', value = '';
  const field = /\b(anim|animation|sparkno|guard\.sparkno|hitsound|guardsound|sprite|value)\s*[:=]\s*([^;\n}]+)/i.exec(raw);
  if (!field) {
    const frame = /^(-?\d+)\s*,\s*(-?\d+)\s*,\s*-?\d+\s*,\s*-?\d+\s*,/.exec(raw);
    return frame && lines.slice(0, line).some(value => /^\s*\[begin action\s/i.test(value)) ? {kind:'sff', group:Number(frame[1]), number:Number(frame[2])} : null;
  }
  const name = field[1].toLowerCase(); value = field[2].trim();
  if (name === 'value') {
    const context = lines.slice(Math.max(0, line - 30), line + 1).join('\n');
    const controllers = [...context.matchAll(/(?:^\s*type\s*=\s*(\w+)|\b(\w+)\s*\{)/gim)];
    const last = controllers.at(-1);
    const controller = (last?.[1] || last?.[2] || '').toLowerCase();
    kind = controller === 'playsnd' ? 'snd' : /^changeanim/.test(controller) ? 'air' : '';
  } else kind = /sound/.test(name) ? 'snd' : name === 'sprite' ? 'sff' : 'air';
  if (!kind) return null;
  const match = /^([a-z_][a-z0-9_]*?)?\s*(-?\d+)\s*(?:,\s*(-?\d+))?$/i.exec(value);
  if (!match || (kind !== 'air' && match[3] === undefined)) return { kind, expression: value };
  return { kind, prefix: match[1] || (/sparkno|sound/.test(name) && name !== 'value' ? 'f' : ''), group: Number(match[2]), number: match[3] === undefined ? undefined : Number(match[3]) };
}

function associatedDefs(seed) {
  const { resolveAssigned } = require('./related_work');
  const result = [], wanted = path.resolve(seed).toLowerCase();
  let folder = path.dirname(path.resolve(seed));
  for (let depth = 0; depth < 5; depth++) {
    if (!fs.existsSync(folder)) break;
    for (const name of fs.readdirSync(folder).filter(name => /\.def$/i.test(name))) {
      const filename = path.join(folder, name), assets = resolveAssigned(filename);
      if ([assets.def, assets.sff, assets.air, assets.snd, ...assets.code].some(file => file && path.resolve(file).toLowerCase() === wanted)) result.push(filename);
    }
    if (path.basename(folder).toLowerCase() === 'chars' || path.dirname(folder) === folder) break;
    folder = path.dirname(folder);
  }
  return [...new Set(result)];
}

async function resolveOwner(seed, prompt=true) {
  const vscode = require('vscode');
  const { nearestCharacterDef, chooseCharacterDef } = require('./character_picker');
  seed = seed?.fsPath || seed || '';
  const inherited=archiveContext(seed);
  const owners = inherited?[inherited.ownerDef]:seed ? associatedDefs(seed) : [];
  let def = owners.length === 1 ? owners[0] : '';
  if (owners.length > 1) {
    const picked = await vscode.window.showQuickPick(owners.map(filename => ({label:path.basename(filename), description:filename, filename})), {title:'Choose the asset owner', matchOnDescription:true});
    if (!picked) return;
    def = picked.filename;
  }
  if (!def) def = nearestCharacterDef(seed) || '';
  if (!def && /\.air$/i.test(seed)) def = require('./character_asset_resolver').inferCharacterFiles(seed)?.defPath || '';
  if (!def && prompt) def = await chooseCharacterDef(seed ? vscode.Uri.file(seed) : undefined, { title: 'Choose the character for this viewer' });
  if (!def && prompt) return;
  return {def,inherited};
}

async function openConnected(seed, target, reference, sourceOrigin, fromPoint, owner) {
  const vscode=require('vscode');
  const {resolveAssigned}=require('./related_work');
  seed=seed?.fsPath||seed||'';
  owner=owner||await resolveOwner(seed);if(!owner?.def)return;
  const {def,inherited}=owner;
  const assets = resolveAssigned(def);
  if (reference?.expression && assets.constants && fs.existsSync(assets.constants)) {
    const name = /^const\(\s*([\w.]+)\s*\)$/i.exec(reference.expression)?.[1];
    const document = vscode.workspace.textDocuments.find(doc => path.resolve(doc.fileName).toLowerCase() === path.resolve(assets.constants).toLowerCase());
    const constant = name && require('./move_constants_model').parseConstants(document ? document.getText() : fs.readFileSync(assets.constants, 'utf8')).byName.get(name.toLowerCase());
    if (constant && target === 'air' && Number.isInteger(constant.value)) reference = {kind:target, group:constant.value};
  }
  if (target === 'source') {
    const files = [...new Set([seed, assets.def, ...assets.code].filter(f => f && fs.existsSync(f) && /\.(def|air|cns|zss|cmd|txt)$/i.test(f)))];
    const choice = await vscode.window.showQuickPick(files.map(filename => ({ label: path.basename(filename), description: filename, filename })), { title: 'Open connected text editor', matchOnDescription: true });
    if (choice) return vscode.window.showTextDocument(vscode.Uri.file(choice.filename), { preview: false });
    return;
  }
  let filename = inherited?inherited.record[target]:assets[target],chosenContext=inherited||null;
  if (reference?.prefix && reference.prefix.toLowerCase() !== 's' || reference?.expression) {
    const registry=archiveRegistry(def),combined=String(reference.prefix||'')+String(reference.group??'');
    const matched=registry.candidates.map(item=>item.prefix).sort((a,b)=>b.length-a.length).find(prefix=>combined.toLowerCase().startsWith(prefix)&&/^-?\d+$/.test(combined.slice(prefix.length)));
    if(matched)reference={...reference,prefix:matched,group:Number(combined.slice(matched.length))};
    const resolved=require('./viewer_archive_registry').resolveReference(registry,reference.prefix,target);
    let record=resolved.candidates.length===1?resolved.candidates[0]:null;
    if(resolved.candidates.length>1){const choice=await vscode.window.showQuickPick(resolved.candidates.map(item=>({label:path.basename(item[target]),description:item[target],detail:item.source,record:item})),{title:'Choose archive for duplicate prefix '+resolved.prefix,matchOnDescription:true});if(!choice)return;record=choice.record;}
    if(record&&!reference.expression){filename=record[target];chosenContext={ownerDef:def,prefix:resolved.prefix,record};}
    else {
      const picked = await vscode.window.showOpenDialog({ title: `Unresolved ${reference.expression || reference.prefix + reference.group}: choose ${target.toUpperCase()} archive`, filters: { [target.toUpperCase()]: [target] }, canSelectMany: false });
      if (!picked?.length) return;
      filename = picked[0].fsPath;chosenContext={ownerDef:def,prefix:reference.prefix||'manual',record:{[target]:filename,source:'Archive selected manually'}};
    }
  }
  if (!filename || !fs.existsSync(filename)) return vscode.window.showInformationMessage(`No available ${target.toUpperCase()} is assigned to ${chosenContext?'shared prefix '+chosenContext.prefix:'this character'}.`);
  if (Number.isInteger(reference?.group)) {
    let found = false;
    if (target === 'air') {
      const document = vscode.workspace.textDocuments.find(doc => path.resolve(doc.fileName).toLowerCase() === path.resolve(filename).toLowerCase());
      found = require('./air_preview_model').parseAir(document ? document.getText() : fs.readFileSync(filename, 'utf8')).some(action => action.number === reference.group);
    } else if (target === 'snd') found = require('./snd_reader').readSnd(filename).entries.some(entry => entry.group === reference.group && entry.index === reference.number);
    else if (target === 'sff') found = require('./sff_reader').readSff(filename).sprites.some(sprite => sprite.group === reference.group && sprite.number === reference.number);
    if (!found) return vscode.window.showInformationMessage(`${target.toUpperCase()} reference ${reference.group}${reference.number === undefined ? '' : ',' + reference.number} was not found in ${path.basename(filename)}.`);
  }
  const origin=sourceOrigin||origins.get(assetKey(seed));
  if(origin)rememberSource(filename,origin);
  let opened;
  if (target === 'air') opened=await require('./air_viewer').openAirPreview(vscode.Uri.file(filename), { preserveFocus: false, action: reference?.group });
  const command = { sff: 'sff.openViewer', snd: 'snd.openViewer' }[target];
  if (command) opened=await vscode.commands.executeCommand(command, vscode.Uri.file(filename), undefined, reference);
  if(opened){await rememberArchive(filename,chosenContext);history.transition(fromPoint||(sourceOrigin?{...sourceOrigin,kind:'source'}:null),viewerPoint(filename,target,reference,opened.panel||opened));}
  return opened;
}

function registerViewerNavigation(context) {
  require('./viewer_toolbar').configure(context);
  archiveContextStore=require('./viewer_archive_context').createStore(context.workspaceState,(def,prefix,kind)=>require('./viewer_archive_registry').resolveReference(archiveRegistry(def),prefix,kind).candidates);
  const vscode = require('vscode');
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.viewer.back',()=>travelHistory(-1)));
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.viewer.forward',()=>travelHistory(1)));
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.viewer.openReference', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const reference = referenceAt(editor.document.getText(), editor.selection.active.line);
    if (!reference) return vscode.window.showInformationMessage('Place the cursor on an animation, sprite, or sound assignment.');
    const at=editor.selection.active;
    return openConnected(editor.document.fileName, reference.kind, reference,{filename:editor.document.fileName,line:at.line,character:at.character,viewColumn:editor.viewColumn,text:editor.document.lineAt(at.line).text});
  }));
}

module.exports = { resetSourcePanel:panel=>sourcePanels.delete(panel), openPresetPoint, openHistoryPoint, resolveOwner, fitSprite, referenceAt, associatedDefs, openConnected, registerViewerNavigation, locateOrigin, rememberSource, registerSourcePanel, backToSource, currentPoint, travelHistory, acknowledgeRestore, archiveRegistry, openReferenceSource, openViewerSource, archiveContext };
