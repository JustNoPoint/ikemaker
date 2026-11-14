'use strict';

const catalog=require('./trigger_catalog_normalization').normalizeTriggerCatalog(require('../data/triggers.json'));
const {triggerFamily}=require('./authoring_browser_model');
const {entryAvailable}=require('./catalog_capability_filter');
const {argumentSlots,argumentSummary}=require('./trigger_argument_model');
const {capabilityFingerprint}=require('./capability_fingerprint');

const SUPPORTED=new Set(['zss','ikemen-cns']);
function oneLine(value,max=2048){const result=String(value||'').replace(/[\r\n]+/g,' ').trim();return Buffer.byteLength(result,'utf8')<=max?result:'';}
function parameterLabels(entry){
  const signature=String(entry?.signature||''),parenthesized=/\(([^)]*)\)/.exec(signature);
  if(parenthesized)return parenthesized[1].split(',').map(value=>value.trim()).filter(Boolean).slice(0,16);
  const documented=String(entry?.arguments||'').trim();
  if(!documented||/^none$/i.test(documented))return[];
  return documented.split(',').map(value=>value.trim()).filter(Boolean).slice(0,16);
}
function escapeSnippet(value){return String(value||'value').replace(/[}$\\]/g,'\\$&').replace(/[^A-Za-z0-9_. -]+/g,' ').trim()||'value';}
function insertionPlan(entry,selections={},capabilities={}){
  const name=oneLine(entry?.name,256);if(!name)return null;
  const parameters=parameterLabels(entry),slots=new Map(argumentSlots(entry,capabilities).map(slot=>[slot.position,slot]));let tabstop=0;
  const values=[];
  for(let position=0;position<parameters.length;position+=1){
    const slot=slots.get(position),selection=selections[position];
    if(selection?.kind==='omit'&&slot?.optional===true){if(position!==parameters.length-1)throw new Error('Only a trailing optional trigger argument can be omitted safely.');continue;}
    if(selection&&['choice','expression'].includes(selection.kind)){values.push({template:String(selection.value),preview:String(selection.value)});continue;}
    tabstop+=1;const label=slot?.name||parameters[position];values.push({template:`\${${tabstop}:${escapeSnippet(label)}}`,preview:`<${label}>`});
  }
  return values.length?{template:`${name}(${values.map(value=>value.template).join(', ')})`,preview:`${name}(${values.map(value=>value.preview).join(', ')})`}:{template:name,preview:name};
}
function insertionTemplate(entry){return insertionPlan(entry)?.template||null;}
function triggerIdentity(entry){return`${String(entry?.name||'').toLowerCase()}\0${entry?.signature||''}\0${entry?.source||''}`;}
function pickerItems(entries=catalog,options={}){
  const favorites=new Set(options.favorites||[]),recents=options.recents||[],usage=options.usage||{},order=options.order||'recent';
  return(Array.isArray(entries)?entries:[]).filter(entry=>entry&&oneLine(entry.name,256)&&entryAvailable(entry,options.capabilities)).slice(0,256).map(entry=>{const id=triggerIdentity(entry),favorite=favorites.has(id),recentIndex=recents.indexOf(id),useCount=Math.max(0,Number(usage[id])||0);return{
    id,label:oneLine(entry.name,256),description:oneLine(entry.signature||entry.name,512),detail:oneLine(`${favorite?'★ Favorite · ':recentIndex>=0?'Recent · ':''}${useCount?`Used ${useCount}× · `:''}${triggerFamily(entry)} · ${entry.returnType?`returns ${entry.returnType} · `:''}${entry.status==='new'?'IKEMEN new or expanded':'documented IKEMEN expression'} · ${entry.description||''}`,2048),favorite,recentIndex,useCount,family:triggerFamily(entry),source:oneLine(entry.source||'Bundled IKEMEN documentation',256),template:insertionTemplate(entry),entry
  };}).sort((left,right)=>Number(right.favorite)-Number(left.favorite)||(order==='most-used'?right.useCount-left.useCount:order==='recent'?(left.recentIndex<0?999:left.recentIndex)-(right.recentIndex<0?999:right.recentIndex):0)||left.family.localeCompare(right.family)||left.label.localeCompare(right.label,undefined,{sensitivity:'base'}));
}
function replacementRange(vscode,editor){
  if(!editor.selection.isEmpty)return editor.selection;
  return editor.document.getWordRangeAtPosition(editor.selection.active,/[A-Za-z_][A-Za-z0-9_.]*/)||new vscode.Range(editor.selection.active,editor.selection.active);
}
function point(value){return{line:Number(value?.line)||0,character:Number(value?.character)||0};}
function samePoint(left,right){return Number(left?.line)===right.line&&Number(left?.character)===right.character;}
function targetSnapshot(editor,range,capabilities={}){return{editor,document:editor.document,uri:editor.document.uri?.toString?.()||String(editor.document.fileName||''),version:editor.document.version,selection:{start:point(editor.selection.start),end:point(editor.selection.end)},range,capabilityFingerprint:capabilityFingerprint(capabilities)};}
function targetCurrent(vscode,target){const editor=vscode.window.activeTextEditor;return editor===target.editor&&editor?.document===target.document&&(editor.document.uri?.toString?.()||String(editor.document.fileName||''))===target.uri&&editor.document.version===target.version&&samePoint(editor.selection.start,target.selection.start)&&samePoint(editor.selection.end,target.selection.end);}
function validExpression(value){return typeof value==='string'&&value.trim().length>0&&Buffer.byteLength(value,'utf8')<=4096&&!/[\u0000]/.test(value);}
function argumentChoiceItems(slot){
  const choices=slot.choices.map(choice=>({label:choice.label||choice.value,description:choice.type||slot.type||'',detail:choice.meaning||'',kind:'choice',value:choice.value}));
  if(slot.allowExpression){
    choices.push({label:'$(edit) Enter expression…',description:'Editable expression',detail:'Type a literal, variable, function call, or other supported expression.',kind:'expression'});
    choices.push({label:'$(symbol-field) Keep editable placeholder',description:`Edit ${slot.name} after insertion`,detail:'Insert the documented argument name as a native snippet placeholder.',kind:'placeholder'});
  }
  if(slot.optional===true)choices.push({label:'$(circle-slash) Omit optional argument',description:'Insert no value for this trailing optional position',detail:slot.meaning||'',kind:'omit'});
  return choices;
}
async function chooseArgumentSelections(vscode,entry,capabilities={}){
  const selections={},slots=argumentSlots(entry,capabilities);
  for(const slot of slots){
    if(!slot.choices.length&&slot.optional!==true)continue;
    const picked=await vscode.window.showQuickPick(argumentChoiceItems(slot),{title:`${entry.name} — argument ${slot.position+1}: ${slot.name}`,placeHolder:slot.meaning||'Choose a documented value or keep this argument editable.',matchOnDescription:true,matchOnDetail:true});
    if(!picked)return{cancelled:true,selections:{}};
    if(picked.kind==='expression'){
      const value=await vscode.window.showInputBox({title:`${entry.name} — ${slot.name}`,prompt:slot.meaning||'Enter an expression for this argument.',placeHolder:slot.name,validateInput:value=>validExpression(value)?undefined:'Enter a non-empty expression of at most 4096 bytes.'});
      if(value===undefined)return{cancelled:true,selections:{}};
      selections[slot.position]={kind:'expression',value:value.trim()};
    }else if(picked.kind==='choice')selections[slot.position]={kind:'choice',value:picked.value};
    else if(picked.kind==='omit')selections[slot.position]={kind:'omit'};
  }
  return{cancelled:false,selections};
}
function selectionsAvailable(entry,selections,capabilities={}){
  const slots=new Map(argumentSlots(entry,capabilities).map(slot=>[slot.position,slot]));
  for(const [rawPosition,selection] of Object.entries(selections||{})){const slot=slots.get(Number(rawPosition));if(!slot)return false;if(selection.kind==='choice'&&!slot.choices.some(choice=>choice.value===selection.value))return false;if(selection.kind==='expression'&&(!slot.allowExpression||!validExpression(selection.value)))return false;if(selection.kind==='omit'&&slot.optional!==true)return false;}
  return true;
}
async function run(vscode,preferences={},getCapabilities=()=>({})){
  const editor=vscode.window.activeTextEditor,document=editor?.document;
  if(!document||!SUPPORTED.has(document.languageId))return vscode.window.showInformationMessage('Open a ZSS or CNS source file before browsing triggers and expressions.');
  const capabilities=getCapabilities(document.uri);
  const picked=await vscode.window.showQuickPick(pickerItems(catalog,{favorites:preferences.favorites?.()||[],recents:preferences.recents?.()||[],usage:preferences.usage?.()||{},order:preferences.order?.()||'recent',capabilities}),{title:'Browse / Insert Trigger or Expression',placeHolder:'Favorites first; remaining expressions follow your catalog-order setting. Search by trigger, signature, purpose, return type, or explanation.',matchOnDescription:true,matchOnDetail:true});
  if(!picked)return false;
  const target=targetSnapshot(editor,replacementRange(vscode,editor),capabilities),configured=await chooseArgumentSelections(vscode,picked.entry,capabilities);
  if(configured.cancelled)return false;
  const plan=insertionPlan(picked.entry,configured.selections,capabilities);if(!plan)return false;
  const favoriteAction=picked.favorite?'Remove Favorite':'Add Favorite',answer=await vscode.window.showInformationMessage(`Insert ${picked.label}?`,{modal:true,detail:`${picked.description}\n${picked.detail}\n\nSource: ${picked.source}.\n\nReviewed expression:\n${plan.preview}\n\n${argumentSummary(picked.entry,capabilities)||'Unselected values remain editable native snippet placeholders.'}`},'Insert',favoriteAction);
  if(answer===favoriteAction){await preferences.toggleFavorite?.(picked.id);return false;}
  if(answer!=='Insert')return false;
  const freshCapabilities=getCapabilities(document.uri);
  if(capabilityFingerprint(freshCapabilities)!==target.capabilityFingerprint)return vscode.window.showWarningMessage('The exact project engine target changed while the expression was being reviewed. Nothing was inserted; browse again.');
  if(!entryAvailable(picked.entry,freshCapabilities)||!selectionsAvailable(picked.entry,configured.selections,freshCapabilities))return vscode.window.showWarningMessage('The project engine target changed and no longer supports this reviewed expression or argument value. Nothing was inserted.');
  if(!targetCurrent(vscode,target))return vscode.window.showWarningMessage('The source changed, or the selection or active editor moved while the expression was being reviewed. Nothing was inserted; browse again.');
  const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,target.range,new vscode.SnippetString(plan.template));
  if(!await vscode.workspace.applyEdit(edit))return vscode.window.showWarningMessage('VS Code did not insert the reviewed expression. Nothing was saved.');
  await preferences.recordRecent?.(picked.id);
  return true;
}
function registerTriggerExpressionPicker(vscode,context,getCapabilities=()=>({})){
  const favoritesKey='ikemen.triggerExpressionFavorites.v1',recentsKey='ikemen.triggerExpressionRecents.v1',usageKey='ikemen.triggerExpressionUsage.v1',read=(key,fallback=[])=>context.globalState?.get(key,fallback)??fallback,write=(key,value)=>context.globalState?.update(key,value),preferences={favorites:()=>read(favoritesKey),recents:()=>read(recentsKey),usage:()=>read(usageKey,{}),order:()=>vscode.workspace.getConfiguration('ikemenZss').get('authoring.catalogOrder','recent'),toggleFavorite:async id=>{const values=read(favoritesKey);await write(favoritesKey,values.includes(id)?values.filter(value=>value!==id):[...values,id].slice(-100));},recordRecent:async id=>{await write(recentsKey,[id,...read(recentsKey).filter(value=>value!==id)].slice(0,20));const usage=read(usageKey,{});await write(usageKey,{...usage,[id]:Math.min(1000000,(Number(usage[id])||0)+1)});}};
  const disposable=vscode.commands.registerCommand('ikemen.triggers.browseInsert',()=>run(vscode,preferences,getCapabilities));context.subscriptions.push(disposable);
  require('./trigger_argument_editor').registerTriggerArgumentEditor(vscode,context,preferences,getCapabilities);
  return disposable;
}

module.exports={SUPPORTED,oneLine,parameterLabels,insertionPlan,insertionTemplate,triggerIdentity,pickerItems,replacementRange,targetSnapshot,targetCurrent,argumentChoiceItems,chooseArgumentSelections,selectionsAvailable,run,registerTriggerExpressionPicker};
