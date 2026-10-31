'use strict';

const assert=require('assert');
const fs=require('fs');
const Module=require('module');
const originalLoad=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{Uri:{file:fsPath=>({fsPath})},ViewColumn:{One:1,Beside:2},ConfigurationTarget:{WorkspaceFolder:1},commands:{executeCommand:async()=>false},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback,update:async()=>{}})},window:{tabGroups:{activeTabGroup:{viewColumn:1}},showOpenDialog:async()=>undefined,showSaveDialog:async()=>undefined,showInputBox:async()=>undefined,showWarningMessage:async()=>undefined,showInformationMessage:async()=>undefined}};return originalLoad.call(this,request,parent,main)};
const {PaletteWorkspaceController}=require('../src/palette_workspace_controller');

const background='248,0,248,255',outline='16,16,16,255',skin='224,128,64,255';
const collective={entries:[{colorId:background,rgba:[248,0,248,255]},{colorId:outline,rgba:[16,16,16,255]},{colorId:skin,rgba:[224,128,64,255]}]};
const session={collective:{cleanupFillColorId:background,dispositions:{}},organizer:{templateSwatches:{groups:[{id:'outline',name:'Outline',order:'manual',colorIds:[outline]},{id:'skin',name:'Skin',order:'manual',colorIds:[skin]}],groupGap:5,fillerEnabled:false}}};
const plan=PaletteWorkspaceController.templateIndexedPalettePlan(session,collective);
assert.deepStrictEqual(plan.colors[0],[248,0,248,0],'the assigned transparent/background RGB owns protected index 0 with transparent alpha');
assert.strictEqual(plan.indexByColorId.has(background),false,'the cleanup/background color is not duplicated in a named group index');
assert.strictEqual(plan.indexByColorId.get(outline),1,'the first named-group color begins at index 1');
assert.strictEqual(plan.indexByColorId.get(skin),2,'subsequent named-group colors follow index 1 without replacing transparency');
assert.strictEqual(plan.colors.length,256,'the generated palette remains an exact 256-entry table');

Module._load=originalLoad;
console.log('Palette template protects assigned transparent index 0 and begins named groups at index 1');
