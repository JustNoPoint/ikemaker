'use strict';

const assert=require('assert');
const {registerLanguageProviders}=require('../src/language_providers');
class CompletionItem{constructor(label,kind){this.label=label;this.kind=kind;}}class SnippetString{constructor(value){this.value=value;}}class MarkdownString{constructor(){this.value='';}appendMarkdown(value){this.value+=value;return this;}}class Hover{constructor(contents,range){this.contents=contents;this.range=range;}}class Range{constructor(sl,sc,el,ec){this.start={line:sl,character:sc};this.end={line:el,character:ec};}}
const registered={},vscode={workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})},languages:{registerCompletionItemProvider:(_selector,provider)=>{registered.completion=provider;return{dispose(){}};},registerHoverProvider:(_selector,provider)=>{registered.hover=provider;return{dispose(){}};},registerSignatureHelpProvider:(selector,provider)=>{registered.signature={selector,provider};return{dispose(){}};}},CompletionItemKind:{Class:1,Property:2,Reference:3,Function:4,Variable:5},CompletionItem,SnippetString,MarkdownString,Hover,Range};
let source='local function greet(name, ...)\nend\nlocal value = gre',version=1;
const document={languageId:'lua',fileName:'C:\\game\\main.lua',uri:{toString:()=> 'file:///game/main.lua'},get version(){return version;},getText:range=>range?source.slice(range.start?.character||0,range.end?.character||source.length):source,lineAt:line=>({text:source.split(/\r?\n/)[line]||''}),getWordRangeAtPosition:()=>undefined};
const definition={name:'greet',params:['name','...'],varargs:true,local:true,topLevel:true,line:1,filename:document.fileName,uri:{fsPath:document.fileName},documentation:'Greets a player.',parameterDocs:{name:'Exact player name.'},imported:false};
registerLanguageProviders(vscode,{subscriptions:[]},()=>[],()=>({names:[]}),()=>({complete:false,entries:[]}),()=>({kinds:{}}),()=>({complete:false,definitions:[]}),()=>({enabledCapabilities:[],target:{channel:'stable',version:'1.0'}}),()=>({complete:true,definitions:[definition]}));

(async()=>{
  assert(Array.isArray(registered.signature.selector)&&registered.signature.selector.some(item=>item.language==='lua'),'native signature help is registered for Lua editors');
  source='gre\nlocal function greet(name, ...)\nend';version+=1;const beforeDeclaration=await registered.completion.provideCompletionItems(document,{line:0,character:3});assert(!beforeDeclaration.some(item=>item.label==='greet'),'a local function is not offered before its authored declaration');
  source='local function greet(name, ...)\nend\nlocal value = gre';version+=1;
  const items=await registered.completion.provideCompletionItems(document,{line:2,character:17});const user=items.find(item=>item.label==='greet');assert(user,'authored Lua function appears beside bundled API assistance');assert.strictEqual(user.insertText.value,'greet(${1:name}, ${2:values})');assert.strictEqual(user.range.start.character,14);
  source='local function greet(name, ...)\nend\ngreet(foo(1, 2), "a,b", extra)';version+=1;
  const signature=await registered.signature.provider.provideSignatureHelp(document,{line:2,character:29});assert.strictEqual(signature.signatures[0].label,'greet(name, ...)');assert.strictEqual(signature.activeParameter,1,'varargs remain selected after the fixed first parameter');assert.strictEqual(signature.signatures[0].parameters[0].documentation,'Exact player name.');
  const hover=await registered.hover.provideHover(document,{line:2,character:2});assert(hover.contents.value.includes('Authored Lua function')&&hover.contents.value.includes('Greets a player.')&&hover.contents.value.includes('main.lua:2'));
  console.log('Native Lua user-function completion, hover, and signature tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
