'use strict';
const assert=require('assert'),Module=require('module');const original=Module._load,calls=[];
const vscode={commands:{executeCommand:async(...args)=>calls.push(args),registerCommand:()=>({dispose(){}})}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main)};
(async()=>{const workspace=require('../src/palette_import_workspace');await workspace.openPaletteImportWorkspace({fsPath:'C:/art/ryu.png'});assert.deepStrictEqual(calls,[['ikemen.palette.openWorkspace',{fsPath:'C:/art/ryu.png'},{section:'sources-preflight',compatibilityAlias:'ikemen.paletteImport.open'}]]);console.log('Palette import compatibility route opens only the canonical retained workspace')})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{Module._load=original});
