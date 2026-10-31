'use strict';
const assert=require('assert'),Module=require('module');const original=Module._load,calls=[];
const vscode={commands:{executeCommand:async(...args)=>calls.push(args),registerCommand:()=>({dispose(){}})}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main)};
(async()=>{const workspace=require('../src/palette_index_organizer_workspace');await workspace.openPaletteIndexOrganizer({fsPath:'C:/art/ryu.png'});assert.deepStrictEqual(calls,[['ikemen.palette.openWorkspace',{fsPath:'C:/art/ryu.png'},{section:'organize',compatibilityAlias:'ikemen.paletteOrganizer.open'}]]);assert.strictEqual(typeof workspace.semanticDraft,'function');console.log('Palette organizer compatibility route and extracted draft owner tests passed')})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{Module._load=original});
