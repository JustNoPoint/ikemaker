'use strict';

const assert=require('assert'),Module=require('module');
const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{};return original.call(this,request,parent,main)};
try{
  const {pinnedSourceMessageAllowed}=require('../src/air_viewer');
  for(const type of ['viewerAssetHistory','applyReviewedCollisionEdit','removePushOverride','saveAir','saveAirAs','updateFrame','saveRuntime','unknownFutureMutation'])assert.equal(pinnedSourceMessageAllowed({type}),false,`${type} must be rejected by the pinned Source deny-by-default gate`);
  for(const type of ['actionSelected','frame','thumbnails','copyText','reveal','openSff','airTransferCommand'])assert.equal(pinnedSourceMessageAllowed({type}),true,`${type} remains a read-only Source operation`);
  assert.equal(pinnedSourceMessageAllowed({type:'ikemaker.universal-toolbar.invoke',slotId:'save'}),false);
  assert.equal(pinnedSourceMessageAllowed({type:'ikemaker.universal-toolbar.invoke',slotId:'help'}),true);
  assert.equal(pinnedSourceMessageAllowed({type:'command',command:'air.openActionLog'}),true);
  assert.equal(pinnedSourceMessageAllowed({type:'command',command:'air.deleteSelectedFromViewer'}),false,'arbitrary command dispatch cannot bypass Source read-only policy');
  console.log('AIR Transfer pinned Source uses a deny-by-default mutation policy');
}finally{Module._load=original;}
