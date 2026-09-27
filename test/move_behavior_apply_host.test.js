'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const vm=require('vm');
const Module=require('module');
const {FormDrafts}=require('../src/form_drafts');
const {hash}=require('../src/mutation_safety');

const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{workspace:{}};return original.call(this,request,parent,main);};
const {behaviorComponentModel,validComponentReference}=require('../src/move_lab_component_model');
Module._load=original;
const workspaceSource=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-behavior-apply-')),defPath=path.join(root,'Hero.def'),filename=path.join(root,'states.zss');
let text='// neighbor before\n[StateDef 20]\nctrl: 0;\n[StateDef 21]\nctrl: 1;\n// neighbor after';
fs.writeFileSync(defPath,'[Info]\nname=Hero\n[Files]\nst=states.zss\n');fs.writeFileSync(filename,text);
const assets={defPath,folder:root,code:[filename],constants:''},sent=[],warnings=[],drafts=new FormDrafts();
const document={uri:{fsPath:filename},fileName:filename,getText:()=>text,get lineCount(){return text.split(/\r?\n/).length;},lineAt(line){const lines=text.split(/\r?\n/);return{lineNumber:line,text:lines[line]||'',range:{start:{line,character:0},end:{line,character:(lines[line]||'').length}}};}};
const currentModel=()=>{const behavior=behaviorComponentModel(assets,[document],[]).components;return{moves:[],directComponents:[],behaviorComponents:behavior,overview:{controllers:[],behaviors:behavior,constantProfiles:[],problems:[]},files:assets,timingSources:{},codeDrafts:{}};};
const session={assets,model:currentModel(),draftDefs:new Set([defPath.toLowerCase()]),busy:false,panel:{webview:{postMessage:async message=>sent.push(message)}}};
class Range{constructor(start,end){this.start=start;this.end=end;}}
class WorkspaceEdit{replace(uri,range,value){this.range=range;this.value=value;}}
const sandbox={session,codeFormDrafts:drafts,codeDraftKey:(def,id)=>'move-code:'+def.toLowerCase()+'#'+id,codeSectionFor:()=>null,handleLaunchMessage:async()=>false,shellModelFor:async()=>currentModel(),validComponentReference,componentReference:item=>item.reference,identity:value=>path.resolve(value).toLowerCase(),hash,currentText:async()=>'',refresh:async()=>{},vscode:{workspace:{openTextDocument:async()=>document,applyEdit:async edit=>{const lines=text.split(/\r?\n/),before=lines.slice(0,edit.range.start.line).join('\n'),after=lines.slice(edit.range.end.line+1).join('\n');text=(before?before+'\n':'')+edit.value+(after?'\n'+after:'');return true;}},WorkspaceEdit,Range,window:{showWarningMessage:async message=>warnings.push(message)}},require:request=>request==='./move_code_drafts'?require('../src/move_code_drafts'):require(request),console,Object,Array,String,Number,Boolean,Math,JSON,Set,Map};
vm.createContext(sandbox);vm.runInContext(workspaceSource.slice(workspaceSource.indexOf('async function handle('),workspaceSource.indexOf('async function openMoveConstantsWorkspace(')),sandbox);

(async()=>{try{
 const section=currentModel().behaviorComponents[0],replacement='[StateDef 20]\nctrl: 7;',key=sandbox.codeDraftKey(defPath,section.stableId),draft={sectionId:section.stableId,filename,kind:section.kind,signature:section.signature,baseHash:section.sourceHash,baseText:section.text,baseStartLine:section.startLine,baseEndLine:section.endLine,value:replacement,revision:1};await drafts.stage(key,draft);
 await sandbox.handle({type:'applyCodeSection',componentReference:section.reference,id:section.stableId,baseHash:section.sourceHash,text:replacement,requestId:1});
 assert(text.startsWith('// neighbor before\n[StateDef 20]\nctrl: 7;'),'the exact behavior block is replaced without touching its preceding neighbor');assert(text.endsWith('[StateDef 21]\nctrl: 1;\n// neighbor after'),'the following state and bytes remain intact');assert.strictEqual(sent.find(item=>item.type==='codeSectionApplied').cleared,true);assert.strictEqual(sent.find(item=>item.type==='codeSectionApplied').nextComponentReference.kind,'state','selection is reconciled to the exact edited block');
 const stale=currentModel().behaviorComponents[0],staleDraft={...draft,sectionId:stale.stableId,baseHash:stale.sourceHash,baseText:stale.text,value:'[StateDef 20]\nctrl: 9;',revision:2};await drafts.stage(sandbox.codeDraftKey(defPath,stale.stableId),staleDraft);const before=text;text='// externally inserted\n'+text;await assert.rejects(()=>sandbox.handle({type:'applyCodeSection',componentReference:stale.reference,id:stale.stableId,baseHash:stale.sourceHash,text:staleDraft.value,requestId:2}),/changed|matches/i);assert.strictEqual(text,'// externally inserted\n'+before,'a stale snapshot produces zero writes');assert(drafts.read(sandbox.codeDraftKey(defPath,stale.stableId)),'the stale draft remains recoverable');
 console.log('Exact Move Lab behavior Apply preserves neighboring bytes, reconciles selection, and rejects stale source with zero writes');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
