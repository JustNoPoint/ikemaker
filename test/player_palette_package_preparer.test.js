'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='vscode')return{window:{showOpenDialog:async()=>null},commands:{executeCommand:async()=>{}},ProgressLocation:{Notification:1}};
  return originalLoad.call(this,request,parent,isMain);
};
const {preparePaletteOnlyPackage,PALETTE_PACKAGE_MARKER}=require('../src/player_palette_workspace');
Module._load=originalLoad;
const {transactionalWriteSet}=require('../src/mutation_safety');

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-palette-package-')),target=path.join(root,'Hero.sff');
fs.writeFileSync(target,Buffer.from('reviewed-sff'));
const authority=()=>({schema:'ikemaker.palette-workshop-build-authority',version:1,sffVersion:'2.1',target:{filename:path.resolve(target),exists:true,byteHash:digest(fs.readFileSync(target)),byteLength:fs.statSync(target).size},planFile:{filename:path.join(root,'plan.json'),exists:true,byteHash:'plan',byteLength:4},planSnapshot:'{"version":5}',sources:[],references:[],lifecycle:{},physicalInventory:{sprites:[],palettes:[]}});
const fixed={now:()=>1700000000000,randomBytes:size=>Buffer.alloc(size,0xab)};
const expectedRoot=parent=>path.join(parent,'palette-workshop-Hero-1700000000000-abababab');
const choose=parent=>async()=>[{fsPath:parent}];
const successfulBuild=async options=>{
  const manifest=fs.readFileSync(options.manifestPath),authorityBytes=fs.readFileSync(path.join(options.sourceRoot,'palette-workshop-authority.json')),marker=JSON.parse(fs.readFileSync(path.join(options.sourceRoot,PALETTE_PACKAGE_MARKER),'utf8'));
  assert.strictEqual(manifest.toString(),'OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus\r\n');
  assert.strictEqual(options.reviewEvidence.identity,'palette-workshop-authority.json');assert.strictEqual(options.reviewEvidence.byteHash,digest(authorityBytes));assert.strictEqual(marker.authorityHash,options.reviewEvidence.byteHash);assert.strictEqual(marker.manifestHash,digest(manifest));assert(/^[a-f0-9]{64}$/.test(marker.token));
  fs.mkdirSync(options.outputDirectory);const specificationPath=path.join(options.outputDirectory,'specification.json');fs.writeFileSync(specificationPath,'{"ok":true}\n');return{specificationPath,specificationHash:'reviewed-spec'};
};

(async()=>{try{
  const exactParent=path.join(root,'exact');fs.mkdirSync(exactParent);let assertionCalls=0;
  const exact=await preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,showOpenDialog:choose(exactParent),assertAuthority:()=>{assertionCalls+=1;},createBuildPackage:successfulBuild});
  assert.strictEqual(exact.packageRoot,expectedRoot(exactParent));assert.strictEqual(assertionCalls,2,'authority is checked before creating and immediately before building the package');assert.strictEqual(exact.build.specificationArtifactByteHash,digest(fs.readFileSync(exact.build.specificationPath)));assert.deepStrictEqual(fs.readdirSync(exact.packageRoot).sort(),[PALETTE_PACKAGE_MARKER,'build','palette-only-preserve.csv','palette-workshop-authority.json'].sort());

  const failureParent=path.join(root,'transaction-failure');fs.mkdirSync(failureParent);let renames=0;
  const failingFs=new Proxy(fs,{get(targetFs,name){if(name==='renameSync')return(...args)=>{renames+=1;if(renames===2)throw new Error('injected transactional rename failure');return fs.renameSync(...args);};const value=targetFs[name];return typeof value==='function'?value.bind(targetFs):value;}});
  let transactionError;try{await preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,fs:failingFs,showOpenDialog:choose(failureParent),assertAuthority:()=>{},transactionalWriteSet});}catch(error){transactionError=error;}
  assert(transactionError?.manualCleanupRequired&&/retained for manual cleanup/.test(transactionError.message));assert(fs.existsSync(transactionError.packageRoot));assert.deepStrictEqual(fs.readdirSync(transactionError.packageRoot),[],'transaction rollback removes every partially installed seed while the unsealed directory is retained for manual review');

  const collisionParent=path.join(root,'collision');fs.mkdirSync(collisionParent);const collisionRoot=expectedRoot(collisionParent);fs.mkdirSync(collisionRoot);fs.writeFileSync(path.join(collisionRoot,'foreign.txt'),'keep');let collisionBuilds=0;
  await assert.rejects(()=>preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,showOpenDialog:choose(collisionParent),assertAuthority:()=>{},createBuildPackage:async()=>{collisionBuilds+=1;}}),error=>error.code==='EEXIST');assert.strictEqual(collisionBuilds,0);assert.strictEqual(fs.readFileSync(path.join(collisionRoot,'foreign.txt'),'utf8'),'keep','a package-name collision never overwrites or cleans foreign content');

  const replacementParent=path.join(root,'replacement');fs.mkdirSync(replacementParent);let replacementError;
  try{await preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,showOpenDialog:choose(replacementParent),assertAuthority:()=>{},createBuildPackage:async({sourceRoot})=>{fs.rmSync(sourceRoot,{recursive:true,force:true});fs.mkdirSync(sourceRoot);fs.writeFileSync(path.join(sourceRoot,'replacement.txt'),'foreign');throw new Error('builder failed after replacement');}});}catch(error){replacementError=error;}
  assert(replacementError?.manualCleanupRequired);assert.strictEqual(fs.readFileSync(path.join(replacementError.packageRoot,'replacement.txt'),'utf8'),'foreign','cleanup refuses a replacement directory');

  const junctionParent=path.join(root,'junction');fs.mkdirSync(junctionParent);const junctionTarget=path.join(root,'junction-foreign');fs.mkdirSync(junctionTarget);fs.writeFileSync(path.join(junctionTarget,'foreign.txt'),'junction');let junctionError;
  try{await preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,showOpenDialog:choose(junctionParent),assertAuthority:()=>{},createBuildPackage:async({sourceRoot})=>{fs.rmSync(sourceRoot,{recursive:true,force:true});fs.symlinkSync(junctionTarget,sourceRoot,'junction');throw new Error('builder replaced package with junction');}});}catch(error){junctionError=error;}
  assert(junctionError?.manualCleanupRequired);assert.strictEqual(fs.readFileSync(path.join(junctionTarget,'foreign.txt'),'utf8'),'junction','cleanup refuses a junction and leaves its target untouched');

  const foreignParent=path.join(root,'foreign-content');fs.mkdirSync(foreignParent);let foreignError;
  try{await preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,showOpenDialog:choose(foreignParent),assertAuthority:()=>{},createBuildPackage:async({sourceRoot})=>{fs.writeFileSync(path.join(sourceRoot,'foreign.txt'),'keep');throw new Error('builder failed with unknown content');}});}catch(error){foreignError=error;}
  assert(foreignError?.manualCleanupRequired);assert.strictEqual(fs.readFileSync(path.join(foreignError.packageRoot,'foreign.txt'),'utf8'),'keep','cleanup never recursively deletes unproven foreign content');

  for(const drift of ['plan','target']){
    const parent=path.join(root,`${drift}-drift`);fs.mkdirSync(parent);let checks=0,builds=0,error;
    try{await preparePaletteOnlyPackage({filename:target,authority:authority()},{...fixed,showOpenDialog:choose(parent),assertAuthority:()=>{checks+=1;if(checks===2){if(drift==='target')fs.writeFileSync(target,'changed-target');else throw new Error('plan authority changed after review');}},createBuildPackage:async()=>{builds+=1;}});}catch(value){error=value;}finally{if(drift==='target')fs.writeFileSync(target,'reviewed-sff');}
    assert(error&&error.message.includes(`${drift==='target'?'target changed':'plan authority changed'}`));assert.strictEqual(builds,0);assert(!fs.existsSync(expectedRoot(parent)),'a sealed seed is safely removed when authority drifts before build generation');
  }
  console.log('Palette-only package preparation seals atomic seed artifacts and refuses unsafe cleanup');
}finally{
  try{const junction=expectedRoot(path.join(root,'junction'));if(fs.existsSync(junction)||fs.lstatSync(junction).isSymbolicLink())fs.unlinkSync(junction);}catch(_){}
  fs.rmSync(root,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1;});
