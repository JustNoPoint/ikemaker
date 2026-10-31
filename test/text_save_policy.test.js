'use strict';
const assert=require('assert'),Module=require('module');
const original=Module._load,settings={asset:true,text:'off'};
Module._load=function(request,parent,isMain){if(request==='vscode')return{Uri:{file:fsPath=>({fsPath,scheme:'file'})},workspace:{getConfiguration(section){return{get:(key,fallback)=>section==='files'&&key==='autoSave'?settings.text:section==='ikemenZss'&&key==='autoSave'?settings.asset:fallback};}}};return original.call(this,request,parent,isMain);};
try{
  const toolbar=require('../src/text_editor_toolbar'),document={fileName:'C:/chars/Ryu/normal.zss',languageId:'zss',uri:{scheme:'file',fsPath:'C:/chars/Ryu/normal.zss'},getText:()=>'',isClosed:false},classification=toolbar.classify(document,{get:(_key,fallback)=>fallback}),bound={document,classification,descriptor:{type:'character',ownerDef:'C:/chars/Ryu/Ryu.def'}};
  let model=toolbar.textToolbarModel(bound),save=model.slots.find(slot=>slot.id==='save'),auto=model.slots.find(slot=>slot.id==='auto-save');
  assert.strictEqual(auto.pressed,false,'native text header reports files.autoSave off even when asset Auto Save is on');assert.strictEqual(save.enabled,true,'asset Auto Save cannot disable native text Save');
  settings.asset=false;settings.text='afterDelay';model=toolbar.textToolbarModel(bound);save=model.slots.find(slot=>slot.id==='save');auto=model.slots.find(slot=>slot.id==='auto-save');
  assert.strictEqual(auto.pressed,true,'native text header reports files.autoSave on even when asset Auto Save is off');assert.strictEqual(save.enabled,false);assert.strictEqual(save.reason,'Save is unavailable because Auto Save is on.');
  console.log('Native text Save and Auto Save derive from the same files.autoSave policy in contradictory asset settings');
}finally{Module._load=original;}
