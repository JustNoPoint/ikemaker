'use strict';

const assert=require('assert');
const {insertCatalogItem}=require('../src/authoring_catalog_insertion');
const warnings=[],recent=[];let editor=null,insertResult=true,insertError=null;
const vscode={SnippetString:class{constructor(value){this.value=value;}},commands:{executeCommand:async()=>{}},window:{get activeTextEditor(){return editor;},showWarningMessage:async message=>{warnings.push(message);}}};
const services={capabilities:async()=>({nightlyStringsEnabled:true,enabledCapabilities:[]}),entryAvailable:()=>true,recordRecent:async id=>{recent.push(id);}};
const snippet={id:'recipe.section',kind:'recipeSection',snippet:'changeState{value: 200}'};
function codeEditor(languageId='zss'){return{document:{languageId},selection:{active:{line:0,character:0}},insertSnippet:async()=>{if(insertError)throw insertError;return insertResult;}};}

(async()=>{
  editor=null;assert.strictEqual((await insertCatalogItem(vscode,snippet,services)).inserted,false);assert.deepStrictEqual(recent,[]);
  editor=codeEditor('plaintext');assert.strictEqual((await insertCatalogItem(vscode,snippet,services)).inserted,false);assert.deepStrictEqual(recent,[]);
  editor=codeEditor();insertResult=false;assert.strictEqual((await insertCatalogItem(vscode,snippet,services)).inserted,false);assert.deepStrictEqual(recent,[]);
  insertResult=true;insertError=new Error('editor rejected insertion');await assert.rejects(()=>insertCatalogItem(vscode,snippet,services),/editor rejected insertion/);assert.deepStrictEqual(recent,[]);
  insertError=null;const success=await insertCatalogItem(vscode,snippet,services);assert.deepStrictEqual(success,{inserted:true,recentRecorded:true});assert.deepStrictEqual(recent,['recipe.section'],'successful insertion records exactly one Recent entry');
  const failedRecent=await insertCatalogItem(vscode,{...snippet,id:'recipe.second'},{...services,recordRecent:async()=>{throw new Error('settings unavailable');}});assert.deepStrictEqual(failedRecent,{inserted:true,recentRecorded:false});assert.match(warnings.at(-1),/was inserted, but its Recent entry could not be saved/);
  let structures=0;const structure={id:'structure.if',kind:'structure',structureId:'if'};assert.strictEqual((await insertCatalogItem(vscode,structure,{...services,structureById:()=>({id:'if'}),insertStructure:async()=>false})).inserted,false);assert.strictEqual(recent.length,1);assert.strictEqual((await insertCatalogItem(vscode,structure,{...services,structureById:()=>({id:'if'}),insertStructure:async()=>{structures+=1;return true;}})).inserted,true);assert.strictEqual(structures,1);assert.deepStrictEqual(recent,['recipe.section','structure.if']);
  console.log('Authoring catalog insertion records recency exactly once and only after confirmed insertion');
})().catch(error=>{console.error(error);process.exitCode=1;});
