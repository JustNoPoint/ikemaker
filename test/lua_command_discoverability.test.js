'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','extension.js'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start,`${startText} boundary`);return source.slice(start,end).trim();}

(async()=>{
  const catalog=[{name:'animDraw',signature:'animDraw(anim)',description:'Draw an animation',url:'https://example.invalid/lua/animDraw'}],picks=[],warnings=[],information=[],opened=[],inserted=[];
  const document={languageId:'lua',fileName:'C:/Hero/main.lua',getText:()=> 'function drawMenu(player)\nend'};
  const vscode={
    SnippetString:class{constructor(value){this.value=value}},Position:class{constructor(line,character){Object.assign(this,{line,character})}},Selection:class{constructor(start,end){Object.assign(this,{start,end})}},Range:class{constructor(start,end){Object.assign(this,{start,end})}},TextEditorRevealType:{InCenterIfOutsideViewport:1},
    Uri:{file:fsPath=>({fsPath}),parse:value=>({value})},env:{openExternal:async uri=>opened.push(uri.value)},
    workspace:{openTextDocument:async uri=>({uri,lineCount:3})},
    window:{activeTextEditor:{document,selection:{active:{line:0,character:0}},insertSnippet:async snippet=>inserted.push(snippet.value)},showQuickPick:async(items,options)=>{picks.push({items,options});return items[0]},showWarningMessage:async message=>{warnings.push(message);return message},showInformationMessage:async message=>{information.push(message);return message},showTextDocument:async doc=>({document:doc,selection:null,revealRange(){}})}
  };
  const insertLuaApi=vm.runInNewContext(`(${extract('async function insertLuaApi','async function goToLuaFunction')})`,{vscode,luaApiCatalog:catalog,luaAuthoringInsert:entry=>`${entry.name}()`});
  assert.strictEqual(await insertLuaApi(),true);assert.deepStrictEqual(inserted,['animDraw()']);assert.match(picks[0].options.placeHolder,/exact function or hook/);
  const goToLuaFunction=vm.runInNewContext(`(${extract('async function goToLuaFunction','async function openControllerDocs')})`,{vscode,parseLuaFunctions:()=>({definitions:[{name:'drawMenu',params:['player'],filename:'C:/Hero/main.lua',line:0,topLevel:true}]})});
  assert(await goToLuaFunction(),'Command Palette authored-function route prompts and navigates instead of silently returning false');
  const openLuaApiDocs=vm.runInNewContext(`(${extract('async function openLuaApiDocs','function fullLineSelection')})`,{vscode,luaApiCatalog:catalog});
  assert.strictEqual(await openLuaApiDocs(),true);assert.deepStrictEqual(opened,['https://example.invalid/lua/animDraw'],'Lua documentation uses the Lua catalog rather than the state-controller picker');

  const manifest=require('../package.json'),palette=manifest.contributes.menus.commandPalette;
  for(const command of ['ikemen.lua.insertApi','ikemen.lua.goToFunction','ikemen.lua.openApiDocs']){const row=palette.find(item=>item.command===command);assert(row&&row.when==='ikemen.interfaceMode == workspace',`${command} is hidden outside Workspace mode`)}
  vscode.window.activeTextEditor=null;assert.match(await insertLuaApi(),/Open a Lua file/);assert.match(await goToLuaFunction(),/Open a Lua file/);assert.strictEqual(warnings.length,2);
  console.log('Lua authoring commands are Workspace-gated and provide exact picker, navigation, documentation, and prerequisite routes');
})().catch(error=>{console.error(error);process.exitCode=1});
