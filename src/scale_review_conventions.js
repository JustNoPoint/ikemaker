'use strict';

const fs = require('fs');
const path = require('path');
const { POLICIES, digest } = require('./character_scale_review_model');

const KEY = 'ikemaker.scaleReview.conventions.v1';
const KINDS = new Set(['explod','modifyexplod','helper','projectile','modifyprojectile','bindtoparent','bindtoroot']);
function clean(value){const result={};for(const [kind,policy] of Object.entries(value||{}))if(KINDS.has(kind)&&POLICIES[policy])result[kind]=policy;return Object.freeze(result);}
function read(context){return clean(context.workspaceState.get(KEY,{}));}
async function write(context,value){const conventions=clean(value);await context.workspaceState.update(KEY,conventions);return conventions;}
function projection(context,kind){const conventions=read(context),policy=conventions[kind]||'';return Object.freeze({kind,policy,label:POLICIES[policy]?.label||'No project convention',provenance:policy?'Explicit IKEMaker workspace convention':'No convention',appliesTo:'newly authored effects only',enforced:false});}
async function exportFile(context,filename){const conventions=read(context),payload={schema:'ikemaker.scale-review-conventions',version:1,conventions,hash:digest(JSON.stringify(conventions))};await fs.promises.writeFile(filename,JSON.stringify(payload,null,2)+'\n',{flag:'wx'});return payload;}
async function importFile(context,filename){const payload=JSON.parse(await fs.promises.readFile(filename,'utf8'));if(payload?.schema!=='ikemaker.scale-review-conventions'||payload.version!==1||payload.hash!==digest(JSON.stringify(clean(payload.conventions))))throw new Error('That scale convention file is invalid or changed.');return write(context,payload.conventions);}
function register(vscode,context){
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.scaleReview.configureConventions',async()=>{const current=read(context),kind=await vscode.window.showQuickPick([...KINDS].map(value=>({label:value,current:current[value]||'',value})),{title:'Scale Review — New Effect Convention'});if(!kind)return;const choice=await vscode.window.showQuickPick([{label:'No convention',value:''},...Object.values(POLICIES).map(item=>({label:item.label,value:item.id}))],{title:`${kind.value} — default for newly authored effects only`});if(!choice)return;const next={...current};if(choice.value)next[kind.value]=choice.value;else delete next[kind.value];await write(context,next);vscode.window.showInformationMessage(`Scale convention updated for new ${kind.value} effects. Existing code was not changed.`);}),
    vscode.commands.registerCommand('ikemen.scaleReview.exportConventions',async()=>{const uri=await vscode.window.showSaveDialog({title:'Export Scale Review Conventions',filters:{JSON:['json']}});if(!uri)return;try{await exportFile(context,uri.fsPath);vscode.window.showInformationMessage('Scale review conventions exported.');}catch(error){vscode.window.showWarningMessage(`Could not export conventions: ${error.message}`);}}),
    vscode.commands.registerCommand('ikemen.scaleReview.importConventions',async()=>{const selected=await vscode.window.showOpenDialog({title:'Import Scale Review Conventions',canSelectMany:false,filters:{JSON:['json']}});if(!selected?.[0])return;try{await importFile(context,selected[0].fsPath);vscode.window.showInformationMessage('Scale review conventions imported for newly authored effects. Existing code was not changed.');}catch(error){vscode.window.showWarningMessage(`Could not import conventions: ${error.message}`);}})
  );
}

module.exports={KEY,KINDS,clean,read,write,projection,exportFile,importFile,register};
