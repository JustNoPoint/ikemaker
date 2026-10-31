'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {menuDefinitions,iconDefinitions}=require('../src/viewer_toolbar');

const groups=menuDefinitions('palette'),project=groups.find(group=>group.label==='Project').items.filter(item=>!item.separator),edit=groups.find(group=>group.label==='Edit').items.filter(item=>!item.separator),byId=new Map([...project,...edit].map(item=>[item.id,item]));
assert.deepStrictEqual(project.slice(0,6).map(item=>item.id),['palette.project.new','palette.project.open','palette.element.save','palette.element.saveAs','palette.selector.saveBankBNew','palette.selector.overwriteBankB'],'Palette Project starts with exact palette-owned create, open, and output routes');
assert.strictEqual(byId.get('palette.project.new').command,'ikemen.palette.createScratch');
assert.strictEqual(byId.get('palette.project.open').command,'ikemen.palette.openWorkspace');
assert.strictEqual(byId.get('palette.project.open').availability,'context-free','standalone Palette Open remains available without a project seed');
assert.strictEqual(byId.get('palette.element.save').element,'paletteSaveOwner');
assert.strictEqual(byId.get('palette.element.saveAs').element,'paletteSaveAsOwner');
assert.strictEqual(byId.get('palette.element.undo').element,'paletteUndoOwner');
assert.strictEqual(byId.get('palette.element.redo').element,'paletteRedoOwner');
assert(!project.some(item=>item.command==='workbench.action.files.newUntitledFile'||item.command==='workbench.action.files.openFile'||item.command==='workbench.action.files.save'||item.command==='workbench.action.files.saveAs'),'Palette menus never imply generic text-file create/open/save ownership');
const iconIds=iconDefinitions('palette').flat().map(item=>item.actionId);
assert.deepStrictEqual(iconIds.slice(0,2),['palette.element.undo','palette.element.redo'],'Palette header Undo/Redo icons route through the active Palette workspace owner');
const controller=fs.readFileSync(path.join(__dirname,'../src/palette_workspace_controller.js'),'utf8');
assert(controller.includes('this.bindArchiveHistoryDisposal(panel,filename);panel.onDidDispose'),'closing the exact Palette Workshop registers the tested transient-history disposal callback');
assert(!controller.includes('journalled backup'),'Palette overwrite copy must not promise a backup that the write policy does not create');
console.log('Palette menu/header routes use exact action owners, avoid generic file claims, and close transient archive history');
