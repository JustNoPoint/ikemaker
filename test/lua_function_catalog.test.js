'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {parseLuaFunctions,requireBindings,buildLuaFunctionCatalog,luaCatalogStillCurrent,luaCallAtDocumentPosition,luaCompletionContext,luaSymbolAt}=require('../src/lua_function_catalog');

(async()=>{
  const source=`-- function Ignored(bad)
local text = "function AlsoIgnored(nope)"
--[[ function LongIgnored(nope) ]]
--- Formats the authored value.
--- @param value exact authored value
local function format(value, ...)
end
function M.run(left, right) end
function M:method(choice) end
M.assigned = function(item) end
return M
`;
  const parsed=parseLuaFunctions(source,'C:/game/main.lua');
  assert.deepStrictEqual(parsed.definitions.map(item=>item.name),['format','M.run','M:method','M.assigned']);
  assert.deepStrictEqual(parsed.definitions[0].params,['value','...']);
  assert.strictEqual(parsed.definitions[0].varargs,true);
  assert.strictEqual(parsed.definitions[0].documentation,'Formats the authored value.');
  assert.strictEqual(parsed.definitions[0].parameterDocs.value,'exact authored value');
  assert.strictEqual(parsed.returnName,'M');
  const nested=parseLuaFunctions('local function outer()\n  local function hidden() end\nend\n','C:/game/nested.lua');assert.strictEqual(nested.definitions.find(item=>item.name==='hidden').topLevel,false,'nested locals are classified so project-wide assistance can fail closed instead of leaking lexical scope');
  assert.deepStrictEqual(requireBindings(`local util=require("tools.util")\n-- local fake=require("bad")`).map(item=>[item.alias,item.module]),[['util','tools.util']]);

  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-lua-functions-')),tools=path.join(root,'tools');fs.mkdirSync(tools);
  const moduleFile=path.join(tools,'util.lua');fs.writeFileSync(moduleFile,'local M = {}\nfunction M.sum(a, b) end\nfunction M:choose(value, ...) end\nlocal function private() end\nreturn M\n');
  const mainFile=path.join(root,'main.lua'),mainSource='local util = require("tools.util")\nlocal function localOnly(value) end\nutil.sum(1, 2)\n';
  const document={fileName:mainFile,uri:{fsPath:mainFile},version:4,getText:()=>mainSource},vscode={workspace:{textDocuments:[]},Uri:{file:filename=>({fsPath:filename})}};
  const catalog=await buildLuaFunctionCatalog(vscode,document);
  assert.deepStrictEqual(catalog.definitions.map(item=>item.name),['localOnly','util.sum','util:choose'],'only current declarations and exact exports from the directly required module are admitted');
  assert(catalog.definitions.find(item=>item.name==='util.sum').imported);
  assert(!catalog.definitions.some(item=>item.name.includes('private')),'module-private functions never leak through require ownership');
  assert.strictEqual(luaCatalogStillCurrent(vscode,catalog,document),true);fs.writeFileSync(moduleFile,fs.readFileSync(moduleFile,'utf8')+'\n-- changed\n');assert.strictEqual(luaCatalogStillCurrent(vscode,catalog,document),false,'required-module source drift invalidates the assistance authority');
  fs.rmSync(root,{recursive:true,force:true});

  const call=luaCallAtDocumentPosition('util.sum(foo(1, 2), "a,b", value)',0,32);assert.strictEqual(call.name,'util.sum');assert.strictEqual(call.activeParameter,2,'nested calls and quoted commas keep the exact active Lua parameter');
  assert.strictEqual(luaCompletionContext('local result = util.su',0,22).prefix,'util.su');
  assert.strictEqual(luaSymbolAt('local result = util.sum(1,2)',0,20).name,'util.sum');
  const oversized=parseLuaFunctions('x'.repeat(1024*1024),'C:/game/huge.lua');assert.strictEqual(oversized.complete,false);assert.deepStrictEqual(oversized.definitions,[],'oversized Lua input fails closed before regex parsing');
  console.log('Lua user-function catalog and exact require ownership tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
