'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const {pathToFileURL,fileURLToPath}=require('url');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cns-converter-transaction-'));
const def=path.join(root,'Hero.def'),one=path.join(root,'one.cns'),two=path.join(root,'two.cns');
const oneText='[StateDef 100]\ntype = S\n[State 100]\ntype = Null\ntrigger1 = 1\n';
const twoText='[StateDef 200]\ntype = A\n[State 200]\ntype = ChangeState\ntrigger1 = AnimTime = 0\nvalue = 0\n';
fs.writeFileSync(one,oneText);fs.writeFileSync(two,twoText);fs.writeFileSync(def,'[Info]\nname = Hero\n[Files]\nst = one.cns\nst1 = two.cns\n');
const uri={file:filename=>({scheme:'file',fsPath:path.resolve(filename),toString:()=>pathToFileURL(path.resolve(filename)).toString()}),parse:value=>({scheme:'file',fsPath:fileURLToPath(value),toString:()=>value})};
const documents=new Map();function document(filename){const key=path.resolve(filename);if(!documents.has(key))documents.set(key,{fileName:key,uri:uri.file(key),version:1,isDirty:false,getText:()=>fs.readFileSync(key,'utf8')});return documents.get(key)}
const vscode={Uri:uri,ViewColumn:{Active:1},DiagnosticSeverity:{Error:0,Warning:1},workspace:{textDocuments:[],openTextDocument:async value=>document(value.fsPath)},window:{},commands:{},env:{clipboard:{}}};
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return vscode;if(request==='./character_picker')return{chooseCharacterDef:async()=>null,nearestCharacterDef:()=>''};if(request==='./select_roster_preview')return{gameRoot:()=>root};return original.call(this,request,parent,main)};
(async()=>{try{
  const converter=require('../src/cns_converter_workspace');
  const {transactionalWriteSet}=require('../src/mutation_safety');
  const candidate=await converter.buildCandidate(def,'character');
  assert.strictEqual(candidate.canWrite,true);assert.strictEqual(candidate.artifacts.length,2,'the exact character plan contains both assigned CNS conversions');
  const writes=candidate.artifacts.map(artifact=>[artifact.target,artifact.text]),firstTarget=path.resolve(writes[0][0]),secondTarget=path.resolve(writes[1][0]);
  fs.writeFileSync(firstTarget,'existing reviewed target');
  const failing=Object.create(fs);let commits=0;failing.renameSync=(from,to)=>{if(from.endsWith('.tmp')&&++commits===2)throw Error('injected second CNS target failure');return fs.renameSync(from,to)};
  assert.throws(()=>transactionalWriteSet(failing,writes,{journalRoot:root,token:'cns-character',allowExisting:filename=>path.resolve(filename)===firstTarget}),/injected second CNS target failure/);
  assert.strictEqual(fs.readFileSync(firstTarget,'utf8'),'existing reviewed target','a later target failure restores an earlier replaced ZSS exactly');
  assert.strictEqual(fs.existsSync(secondTarget),false,'a later target failure removes a newly created partial ZSS');
  assert.strictEqual(fs.readFileSync(one,'utf8'),oneText);assert.strictEqual(fs.readFileSync(two,'utf8'),twoText,'transaction recovery never changes assigned CNS sources');
  transactionalWriteSet(fs,writes,{journalRoot:root,token:'cns-character-retry',allowExisting:filename=>path.resolve(filename)===firstTarget});
  for(const [filename,text] of writes)assert.strictEqual(fs.readFileSync(filename,'utf8'),text,'the same reviewed write set succeeds unchanged on retry');
  console.log('Exact multi-file CNS conversion output uses production transactional rollback and clean retry');
}finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
