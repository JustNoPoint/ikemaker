'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    if(reference.tab==='movelist'){
      const assigned=(files.movelists||[]).find(item=>assetKey(item.resolved)===assetKey(reference.file));
      return Boolean(assigned&&fs.existsSync(assigned.resolved));
    }
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
    opened = await vscode.commands.executeCommand(command, vscode.Uri.file(point.filename), ['roster','workflow','cns_converter','menu_modes','story_dialogue','palette_index_organizer','artist_intake','sff_assembly','move_lab','spatial_composer','helper','throw_creator','hitdef','palfx_editor','screenpack'].includes(point.kind)?{reference:point.reference,preset:true}:point.kind === 'health' ? {reference:point.reference} : point.kind === 'constants' ? {history:true} : ['sff','snd'].includes(point.kind) ? column : undefined, point.reference, point.kind==='sff'?{ownerDef:point.archiveContext?.ownerDef||context?.ownerDef}:undefined);
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
  if(command)opened=await vscode.commands.executeCommand(command,vscode.Uri.file(point.filename),point.kind==='constants'?{history:true}:undefined,point.reference,point.kind==='sff'?{ownerDef:point.archiveContext?.ownerDef}:undefined);
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
  if(await openSource(origin,point)!==false)history.transition(point||viewerPoint(filename,path.extname(filename).slice(1)),{...origin,kind:'source'});
}
function textWorkspaceContext(origin,fromPoint){
  const ownerDef=fromPoint?.archiveContext?.ownerDef&&path.isAbsolute(fromPoint.archiveContext.ownerDef)?path.resolve(fromPoint.archiveContext.ownerDef):'',root=ownerDef?path.dirname(ownerDef):path.dirname(path.resolve(origin.filename));
  return{type:'character',key:root,label:path.basename(root),root,ownerDef,files:[path.resolve(origin.filename)]};
}
async function openSource(origin,fromPoint) {
  const vscode=require('vscode');
  if(!fs.existsSync(origin.filename)){vscode.window.showInformationMessage('The originating source file is no longer available.');return false;}
  const document=await vscode.workspace.openTextDocument(origin.filename),line=locateOrigin(document.getText(),origin);
  if(line<0){vscode.window.showInformationMessage('The originating line changed or became ambiguous. Open the source through Text Editors and choose the intended line.');return false;}
  const character=Math.min(origin.character||0,document.lineAt(line).text.length);
  if(fromPoint?.panel&&typeof vscode.commands?.executeCommand==='function'){
    try{
      const filename=path.resolve(origin.filename),attachment=await vscode.commands.executeCommand('ikemen.textToolbar.resumeFromVisualViewer',{files:[filename],selectedFile:filename,preserveConnected:true,transitionPanel:fromPoint.panel,context:textWorkspaceContext(origin,fromPoint)});
      if(attachment?.aborted===true)return false;
      if(attachment?.attached===true){
        const visible=(vscode.window.visibleTextEditors||[]).find(editor=>assetKey(editor.document?.fileName)===assetKey(filename)),editor=visible||((vscode.window.activeTextEditor&&assetKey(vscode.window.activeTextEditor.document?.fileName)===assetKey(filename))?vscode.window.activeTextEditor:null),selection=new vscode.Range(line,character,line,character);
        if(editor){editor.selection=selection;editor.revealRange?.(selection);await vscode.window.showTextDocument(document,{preview:false,preserveFocus:false,viewColumn:editor.viewColumn,selection});}
        return true;
      }
    }catch(_){/* Older hosts fall through to the native source route. */}
  }
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
  const ok=await openSource(origin,fromPoint);
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

function cleanDocumentText(vscode, filename) {
  const document = (vscode.workspace.textDocuments || []).find(item => !item.isClosed && assetKey(item.fileName) === assetKey(filename));
  if (document?.isDirty) throw new Error(`Save or revert ${path.basename(filename)} before opening an exact animation reference.`);
  if (document) return { text: document.getText(), version: Number.isSafeInteger(document.version) ? document.version : null, document };
  if (!fs.existsSync(filename)) throw new Error(`${path.basename(filename)} is unavailable.`);
  return { text: fs.readFileSync(filename, 'utf8'), version: null, document: null };
}
function selectedAnimationContext(vscode, defPath, generation) {
  const { resolveAssigned } = require('./related_work'), { exactStateSources } = require('./exact_state_sources'), { hash } = require('./mutation_safety'), def = cleanDocumentText(vscode, defPath), assets = resolveAssigned(defPath, def.text);
  if (!assets.air) throw new Error('The selected character DEF has no assigned AIR file.');
  const air = cleanDocumentText(vscode, assets.air), assignedSources = exactStateSources(defPath, def.text);
  if (!assignedSources.length) throw new Error('The selected character has no bounded assigned CNS/ST/ZSS source graph.');
  const sources = assignedSources.map(filename => { const current = cleanDocumentText(vscode, filename); return { available: true, dirty: false, filename, syntax: /\.zss$/i.test(filename) ? 'zss' : 'cns', text: current.text, sourceHash: hash(current.text), version: current.version }; });
  return { defPath: path.resolve(defPath), defText: def.text, defDirty: false, airPath: path.resolve(assets.air), airText: air.text, assignedSources, sources, inventoryComplete: true, generation };
}
function selectionOffsets(document, selection) {
  if (typeof document.offsetAt === 'function') return { start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) };
  const text = document.getText(), starts = [0]; for (let at = 0; at < text.length; at += 1) if (text[at] === '\n') starts.push(at + 1);
  const offset = point => (starts[point.line] ?? text.length) + Number(point.character || 0);
  return { start: offset(selection.start), end: offset(selection.end) };
}
async function openSelectedAnimationReference(services = {}) {
  const vscode = services.vscode || require('vscode'), editor = services.editor || vscode.window.activeTextEditor;
  if (!editor || !/\.(?:cns|st|zss)$/i.test(editor.document.fileName || '')) return vscode.window.showInformationMessage('Open a CNS, ST, or ZSS source and select a supported animation value expression.');
  const sourcePath = path.resolve(editor.document.fileName), sourceVersion = editor.document.version, capturedSelection = selectionOffsets(editor.document, editor.selection), owners = associatedDefs(sourcePath);
  let defPath = owners.length === 1 ? owners[0] : '';
  if (owners.length > 1) { const picked = await vscode.window.showQuickPick(owners.map(filename => ({ label: path.basename(filename), description: filename, filename })), { title: 'Choose the exact character owner for this animation reference', matchOnDescription: true }); if (!picked) return; defPath = picked.filename; }
  if (!defPath) return vscode.window.showInformationMessage('This source is not assigned by one exact character DEF. Open it through Character Essentials or choose an assigned source.');
  const currentSelection = selectionOffsets(editor.document, editor.selection);
  if (vscode.window.activeTextEditor?.document !== editor.document || editor.document.version !== sourceVersion || currentSelection.start !== capturedSelection.start || currentSelection.end !== capturedSelection.end) return vscode.window.showInformationMessage('The editor or selection context changed before animation-reference lookup.');
  const generation = Date.now(), buildContext = () => selectedAnimationContext(vscode, defPath, generation); let initialContext; try { initialContext = buildContext(); } catch (error) { return vscode.window.showInformationMessage(error.message); } const source = initialContext.sources.find(item => assetKey(item.filename) === assetKey(sourcePath));
  if (!source) return vscode.window.showInformationMessage('The selected source is no longer in that character DEF’s assigned source graph.');
  const { buildAirActionUsageSnapshot, validateAirExpressionTargetAuthority } = require('./air_action_usage_authority'), { resolveSelectedAnimationOccurrence, consumeAnimationTargetRoute } = require('./air_expression_navigation'), { hash } = require('./mutation_safety');
  const snapshot = buildAirActionUsageSnapshot({ ...initialContext, targetToken: () => crypto.randomBytes(24).toString('hex') }), resolved = resolveSelectedAnimationOccurrence(snapshot, { sourcePath, sourceText: editor.document.getText(), sourceHash: hash(editor.document.getText()), selectionStart: capturedSelection.start, selectionEnd: capturedSelection.end });
  if (!resolved.available) return vscode.window.showInformationMessage(resolved.reason);
  if (!resolved.exact || !resolved.occurrence.targetRoute) { const selectable = Number.isInteger(resolved.occurrence.action) && require('./air_preview_model').parseAir(initialContext.airText).some(item => item.number === resolved.occurrence.action); return require('./air_docking_workspace').open(vscode.Uri.file(initialContext.airPath), { view: 'references', action: selectable ? resolved.occurrence.action : null, referenceScope: selectable ? 'selected' : 'all', occurrenceId: resolved.occurrence.id, ownerDef: defPath }); }
  const authority = snapshot.targetAuthorities.get(resolved.occurrence.targetRoute); if (!authority) return vscode.window.showInformationMessage('Exact animation target authority could not be issued.');
  const validate = () => { try { return validateAirExpressionTargetAuthority(authority, { ...buildContext(), targetToken: item => item.occurrenceId === authority.occurrenceId ? authority.route : '0'.repeat(48) }); } catch (_) { return null; } };
  if (!validate()) return vscode.window.showInformationMessage('The source, character assignment, or AIR changed before navigation.');
  await vscode.workspace.openTextDocument(initialContext.airPath);
  if (vscode.window.activeTextEditor?.document !== editor.document || !validate()) return vscode.window.showInformationMessage('The editor, source, or AIR changed while opening. Nothing stale was selected.');
  const airViewer = require('./air_viewer'), opened = await airViewer.openAirPreview(vscode.Uri.file(initialContext.airPath), { preserveFocus: false });
  if (!validate()) { opened?.panel?.reveal?.(); return vscode.window.showInformationMessage('The source or AIR changed during viewer acquisition. No target Action was selected.'); }
  if (!consumeAnimationTargetRoute(snapshot, authority.route)) return vscode.window.showInformationMessage('That exact animation route was already used or became invalid. Refresh before selecting an Action.');
  if (!airViewer.selectAirAction(initialContext.airPath, authority.action)) return vscode.window.showInformationMessage('The AIR viewer changed before the exact Action could be selected.');
  return opened;
}

async function resolveOwner(seed, prompt=true, options={}) {
  const vscode = require('vscode');
  const { nearestCharacterDef, chooseCharacterDef } = require('./character_picker');
  seed = seed?.fsPath || seed || '';
  // An inherited archive family is meaningful only when one visual asset
  // viewer intentionally routes to another. Text-editor navigation must use
  // the character DEF assignment and must never inherit a stale FX archive.
  const inherited=options.allowArchiveContext===true?archiveContext(seed):undefined;
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

function allowsArchiveContext(seed, fromPoint) {
  const filename=seed?.fsPath||seed||'';
  const seedKind=path.extname(filename).slice(1).toLowerCase();
  return Boolean(fromPoint?.panel)&&['sff','air','snd'].includes(String(fromPoint.kind||seedKind).toLowerCase());
}

async function openConnected(seed, target, reference, sourceOrigin, fromPoint, owner, navigationOptions={}) {
  const vscode=require('vscode');
  const {resolveAssigned}=require('./related_work');
  seed=seed?.fsPath||seed||'';
  const viewerColumn=Number.isInteger(fromPoint?.panel?.viewColumn)&&fromPoint.panel.viewColumn>0?fromPoint.panel.viewColumn:undefined;
  // A native text editor is an exact source route.  Persisted shared-FX
  // context belongs to visual-to-visual navigation only; inheriting it here
  // can replace a character AIR/SFF with the last shared archive after a
  // cold start.
  const assetOrigin=navigationOptions.origin!=='text'&&allowsArchiveContext(seed,fromPoint);
  owner=owner||await resolveOwner(seed,true,{allowArchiveContext:assetOrigin});if(!owner?.def)return;
  const def=owner.def,inherited=assetOrigin?owner.inherited:undefined;
  const ownerDocument=(vscode.workspace.textDocuments||[]).find(document=>assetKey(document.fileName)===assetKey(def));
  const assets = resolveAssigned(def,ownerDocument?.getText?.());
  if (reference?.expression && assets.constants && fs.existsSync(assets.constants)) {
    const name = /^const\(\s*([\w.]+)\s*\)$/i.exec(reference.expression)?.[1];
    const document = vscode.workspace.textDocuments.find(doc => path.resolve(doc.fileName).toLowerCase() === path.resolve(assets.constants).toLowerCase());
    const constant = name && require('./move_constants_model').parseConstants(document ? document.getText() : fs.readFileSync(assets.constants, 'utf8')).byName.get(name.toLowerCase());
    if (constant && target === 'air' && Number.isInteger(constant.value)) reference = {kind:target, group:constant.value};
  }
  if (target === 'source') {
    const files = [...new Set([seed, assets.def, ...assets.code].filter(f => f && fs.existsSync(f) && /\.(def|air|cns|st|zss|cmd|jnp|lua|txt)$/i.test(f)))];
    const root = path.dirname(def), ordered = [...new Set([def, ...files].map(filename => path.resolve(filename)))];
    const context={type:'character',key:path.resolve(root),label:path.basename(root),root:path.resolve(root),ownerDef:path.resolve(def),files:ordered};
    if(['beside','window'].includes(navigationOptions.disposition)){
      const preferred=ordered.find(filename=>path.resolve(filename).toLowerCase()===path.resolve(seed).toLowerCase())||def,document=await vscode.workspace.openTextDocument(vscode.Uri.file(preferred));
      const editor=await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.Beside,preview:false,preserveFocus:false});
      if(navigationOptions.disposition==='window'){
        if(!editor||editor.document!==document||vscode.window.activeTextEditor!==editor||vscode.window.activeTextEditor?.document!==document){await vscode.window.showInformationMessage('The selected source opened, but focus changed before it could move to a new window. Nothing else was moved.');return editor;}
        await require('./toolbar_open_disposition').apply(vscode,'window');
      }
      return editor;
    }
    const preferred=ordered.find(filename=>path.resolve(filename).toLowerCase()===path.resolve(seed).toLowerCase())||def;
    const document=await vscode.workspace.openTextDocument(vscode.Uri.file(preferred));
    if(fromPoint?.panel){
      try{
        const attachment=await vscode.commands.executeCommand('ikemen.textToolbar.resumeFromVisualViewer',{files:ordered,selectedFile:preferred,preserveConnected:true,transitionPanel:fromPoint.panel,context});
        if(attachment?.aborted===true)return false;
        if(attachment?.attached===true){
          const visible=(vscode.window.visibleTextEditors||[]).find(editor=>assetKey(editor.document?.fileName)===assetKey(preferred)),editor=visible||((vscode.window.activeTextEditor&&assetKey(vscode.window.activeTextEditor.document?.fileName)===assetKey(preferred))?vscode.window.activeTextEditor:null);
          if(editor)return vscode.window.showTextDocument(document,{viewColumn:editor.viewColumn,preview:false,preserveFocus:false});
          return vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.Active,preview:false,preserveFocus:false});
        }
      }catch(error){
        void vscode.window.showErrorMessage('Could not create the Text Editor header: '+(error?.message||String(error)));
        return false;
      }
      void vscode.window.showErrorMessage('The Text Editor header could not be attached. Please reopen Text Editor from the viewer.');
      return false;
    }
    const visible=(vscode.window.visibleTextEditors||[]).find(editor=>assetKey(editor.document?.fileName)===assetKey(preferred));
    return vscode.window.showTextDocument(document,{viewColumn:visible?.viewColumn||vscode.ViewColumn?.Beside,preview:false,preserveFocus:false});
  }
  const exactTextAsset=navigationOptions.origin==='text'&&path.extname(seed).toLowerCase()===`.${target}`?path.resolve(seed):'';
  let filename = exactTextAsset||(inherited?inherited.record[target]:assets[target]),chosenContext=inherited||null;
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
  if(target==='sff'&&reference?.paletteReturnContext)reference={...reference,paletteReturnContext:{...reference.paletteReturnContext,sffPath:path.resolve(filename),sffByteHash:require('./mutation_safety').hash(fs.readFileSync(filename))}};
  if (target === 'air') opened=await require('./air_viewer').openAirPreview(vscode.Uri.file(filename), { preserveFocus: false, action: reference?.group, viewerColumn, ownerDef:def });
  const command = { sff: 'sff.openViewer', snd: 'snd.openViewer' }[target];
  if (command) {
    // SFF takes session ownership fourth; SND reserves fourth for exact sound authority.
    const args = [vscode.Uri.file(filename), viewerColumn, reference];
    if (target === 'snd') args.push(undefined);
    args.push({ ownerDef:def });
    opened=await vscode.commands.executeCommand(command, ...args);
  }
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
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.air.openSelectedAnimationReference', () => openSelectedAnimationReference({ vscode })));
}

module.exports = { resetSourcePanel:panel=>sourcePanels.delete(panel), openPresetPoint, openHistoryPoint, resolveOwner, allowsArchiveContext, fitSprite, referenceAt, associatedDefs, selectedAnimationContext, selectionOffsets, openSelectedAnimationReference, openConnected, registerViewerNavigation, locateOrigin, rememberSource, registerSourcePanel, backToSource, currentPoint, travelHistory, acknowledgeRestore, archiveRegistry, openReferenceSource, openViewerSource, archiveContext };
