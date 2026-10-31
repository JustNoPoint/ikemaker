'use strict';

const triggerCatalog=require('../data/triggers.json');
const controllerCatalog=require('../data/sctrl.json');
const {entryAvailable,filterAvailable}=require('./catalog_capability_filter');
const {argumentSlots}=require('./trigger_argument_model');
const {callAtOffset,argumentPositionAt,replacementPlan}=require('./trigger_call_context');
const {controllerMap,controllerContext}=require('./language_intelligence');
const {capabilityFingerprint}=require('./capability_fingerprint');

const SUPPORTED=new Set(['zss','ikemen-cns']);
function identity(entry){return`${String(entry?.name||'').toLowerCase()}\0${entry?.signature||''}\0${entry?.source||''}`;}
function uriOf(document){return document?.uri?.toString?.()||String(document?.fileName||'');}
function positionOffset(document,position){
  if(typeof document?.offsetAt==='function')return document.offsetAt(position);
  const lines=String(document?.getText?.()||'').split(/\r?\n/);let offset=0;for(let line=0;line<Math.min(Number(position?.line)||0,lines.length);line+=1)offset+=lines[line].length+1;return offset+(Number(position?.character)||0);
}
function offsetPosition(document,offset){
  if(typeof document?.positionAt==='function')return document.positionAt(offset);
  const before=String(document?.getText?.()||'').slice(0,offset),lines=before.split(/\r?\n/);return{line:lines.length-1,character:lines.at(-1).length};
}
function contextLabel(document,text,call,capabilities){
  const controllers=controllerMap(filterAvailable(controllerCatalog,capabilities)),line=offsetPosition(document,call.start).line,context=controllerContext(text,line,document.languageId,controllers);
  return context?.controller?.name?`Inside ${context.controller.name}`:'No surrounding documented controller was identified';
}
function slotItems(slots,preferred,favorite,entry){
  const rows=slots.map(slot=>({kind:'slot',slot,label:`$(symbol-parameter) ${slot.position+1}. ${slot.name}`,description:[slot.type,slot.optional?'optional':'required',slot.position===preferred?'cursor position':''].filter(Boolean).join(' · '),detail:`${slot.meaning||'Choose a documented value or enter an expression.'}${slot.choices.length?` Known values: ${slot.choices.map(choice=>choice.value).join(', ')}.`:''}`}));
  rows.sort((left,right)=>Number(right.slot.position===preferred)-Number(left.slot.position===preferred)||left.slot.position-right.slot.position);
  rows.push({kind:'favorite',label:favorite?'$(star-empty) Remove from common triggers':'$(star-full) Save as common trigger',description:'Trigger Favorite',detail:'Favorites persist and appear first in Browse / Insert Trigger or Expression.'});
  return rows;
}
function valueItems(slot){
  const rows=slot.choices.map(choice=>({kind:'choice',value:choice.value,label:choice.label||choice.value,description:choice.type||slot.type||'',detail:choice.meaning||slot.meaning||''}));
  if(slot.allowExpression)rows.push({kind:'expression',label:'$(edit) Enter an expression…',description:slot.type||'expression',detail:'Use a literal, variable, function call, or other valid manual expression.'});
  return rows;
}
function validExpression(value){return typeof value==='string'&&value.trim().length>0&&!/[\u0000\r\n]/.test(value)&&Buffer.byteLength(value,'utf8')<=4096;}
function snapshot(editor,call,entry,controller,capabilities={}){return{editor,document:editor.document,uri:uriOf(editor.document),version:editor.document.version,call:{start:call.start,end:call.end,source:call.source,name:call.name},entryId:identity(entry),controller,capabilityFingerprint:capabilityFingerprint(capabilities)};}
function targetCurrent(vscode,target){const editor=vscode.window.activeTextEditor,document=editor?.document;if(editor!==target.editor||document!==target.document||uriOf(document)!==target.uri||document.version!==target.version)return false;return document.getText().slice(target.call.start,target.call.end)===target.call.source;}
function choiceCurrent(entry,position,selection,capabilities){const slot=argumentSlots(entry,capabilities).find(item=>item.position===position);if(!slot)return false;return selection.kind==='choice'?slot.choices.some(choice=>choice.value===selection.value):selection.kind==='expression'&&slot.allowExpression&&validExpression(selection.value);}

async function run(vscode,preferences={},getCapabilities=()=>({})){
  const editor=vscode.window.activeTextEditor,document=editor?.document;
  if(!document||!SUPPORTED.has(document.languageId))return vscode.window.showInformationMessage('Open a writable ZSS or CNS source file and place the cursor on a documented trigger call.');
  const text=document.getText(),offset=positionOffset(document,editor.selection.active),call=callAtOffset(text,new Set(triggerCatalog.map(entry=>entry.name)),offset,document.languageId);
  if(!call)return vscode.window.showInformationMessage('Place the cursor on one documented trigger call, or on a line containing exactly one trigger call.');
  const capabilities=getCapabilities(document.uri),entry=triggerCatalog.find(item=>String(item.name).toLowerCase()===String(call.name).toLowerCase()&&entryAvailable(item,capabilities)),slots=argumentSlots(entry,capabilities);
  if(!entry||!slots.length)return vscode.window.showInformationMessage(`${call.name} has no structured trigger arguments to choose here. You can still edit its expression directly.`);
  const entryId=identity(entry),favorite=(preferences.favorites?.()||[]).includes(entryId),preferred=argumentPositionAt(call,offset),controller=contextLabel(document,text,call,capabilities),target=snapshot(editor,call,entry,controller,capabilities);
  const pickedSlot=await vscode.window.showQuickPick(slotItems(slots,preferred,favorite,entry),{title:`${entry.name} — Trigger Arguments · ${controller}`,placeHolder:'Choose an argument position, or save this trigger for common use.',matchOnDescription:true,matchOnDetail:true});
  if(!pickedSlot)return false;
  if(pickedSlot.kind==='favorite'){await preferences.toggleFavorite?.(entryId);await vscode.window.showInformationMessage(favorite?`${entry.name} was removed from common trigger Favorites.`:`${entry.name} was saved to common trigger Favorites.`);return false;}
  const pickedValue=await vscode.window.showQuickPick(valueItems(pickedSlot.slot),{title:`${entry.name} — ${pickedSlot.slot.name}`,placeHolder:'Choose a documented value or enter an expression.',matchOnDescription:true,matchOnDetail:true});
  if(!pickedValue)return false;
  let selection=pickedValue;
  if(pickedValue.kind==='expression'){
    const current=call.arguments[pickedSlot.slot.position]?.text||'',value=await vscode.window.showInputBox({title:`${entry.name} — ${pickedSlot.slot.name}`,prompt:pickedSlot.slot.meaning||'Enter a valid expression.',value:current,validateInput:value=>validExpression(value)?undefined:'Enter one non-empty line of at most 4096 bytes.'});
    if(value===undefined)return false;selection={kind:'expression',value:value.trim()};
  }
  const plan=replacementPlan(text,call,pickedSlot.slot,selection.value);if(!plan)return vscode.window.showWarningMessage('That argument position cannot be changed safely. Nothing was edited.');
  const answer=await vscode.window.showInformationMessage(`Apply ${entry.name} argument?`,{modal:true,detail:`${controller}.\n\n${pickedSlot.slot.position+1}. ${pickedSlot.slot.name} — ${pickedSlot.slot.meaning||pickedSlot.slot.type}\n\nCurrent:\n${plan.original}\n\nReviewed:\n${plan.preview}\n\nThis makes one undoable source edit and does not save the file.`},'Apply');
  if(answer!=='Apply')return false;
  const freshCapabilities=getCapabilities(document.uri),freshEntry=triggerCatalog.find(item=>identity(item)===target.entryId&&entryAvailable(item,freshCapabilities));
  if(capabilityFingerprint(freshCapabilities)!==target.capabilityFingerprint)return vscode.window.showWarningMessage('The exact project engine target changed while the trigger argument was being reviewed. Nothing was edited; open Trigger Arguments again.');
  if(!freshEntry||!choiceCurrent(freshEntry,pickedSlot.slot.position,selection,freshCapabilities))return vscode.window.showWarningMessage('The project engine target changed and no longer supports this reviewed argument. Nothing was edited.');
  if(!targetCurrent(vscode,target))return vscode.window.showWarningMessage('The source, trigger call, or active editor changed while the argument was being reviewed. Nothing was edited; open Trigger Arguments again.');
  const start=offsetPosition(document,plan.start),end=offsetPosition(document,plan.end),edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(start,end),plan.value);
  if(!await vscode.workspace.applyEdit(edit))return vscode.window.showWarningMessage('VS Code did not apply the reviewed trigger argument. Nothing was saved.');
  await preferences.recordRecent?.(entryId);return true;
}

function registerTriggerArgumentEditor(vscode,context,preferences,getCapabilities=()=>({})){const disposable=vscode.commands.registerCommand('ikemen.triggers.editArguments',()=>run(vscode,preferences,getCapabilities));context.subscriptions.push(disposable);return disposable;}

module.exports={SUPPORTED,identity,positionOffset,offsetPosition,contextLabel,slotItems,valueItems,validExpression,snapshot,targetCurrent,choiceCurrent,run,registerTriggerArgumentEditor};
