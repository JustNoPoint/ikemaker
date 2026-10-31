'use strict';
const assert=require('assert'),Module=require('module'),original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{window:{},workspace:{getConfiguration:()=>({get:()=>false})},commands:{}};return original.call(this,request,parent,main)};
try{
  const {cropVisiblePrepared,opaqueTemplateBackgroundLayer,layeredTemplatePsdLayers,buildTemplateFillerLayer}=require('../src/palette_workspace_controller');
  const transparent=Buffer.alloc(5*5*4),visible=Buffer.alloc(5*5*4);visible[(3*5+2)*4]=200;visible[(3*5+2)*4+3]=255;
  const working={layoutHash:'working',items:[{imageId:'empty',x:0,y:0,width:5,height:5},{imageId:'visible',x:50,y:40,width:5,height:5}],canvas:{width:55,height:45}};
  const result=cropVisiblePrepared([{image:{imageId:'empty'},sprite:{width:5,height:5,rgba:transparent,sourceRect:{x:0,y:0,width:5,height:5}}},{image:{imageId:'visible'},sprite:{width:5,height:5,rgba:visible,sourceRect:{x:10,y:20,width:5,height:5}}}],working);
  assert.deepStrictEqual(result.contentLayout.items,[{imageId:'visible',x:52,y:43,width:1,height:1}],'empty layers are excluded and transparent borders do not affect final bounds');
  assert.deepStrictEqual(result.prepared[0].sprite.sourceRect,{x:12,y:23,width:1,height:1});
  assert.deepStrictEqual([...result.prepared[0].sprite.rgba],[200,0,0,255]);
  const background=opaqueTemplateBackgroundLayer({canvas:{width:2,height:2}},'#123456');
  assert.strictEqual(background.name,'Canvas background (bottom layer)');assert.deepStrictEqual([background.x,background.y,background.width,background.height],[0,0,2,2]);
  for(let at=0;at<background.rgba.length;at+=4)assert.deepStrictEqual([...background.rgba.subarray(at,at+4)],[18,52,86,255],'lowest background is exact chosen opaque color');
  const spriteRgba=Buffer.from([255,0,255,0, 20,30,40,255]),psdLayers=layeredTemplatePsdLayers({canvas:{width:2,height:1},items:[{imageId:'sprite',x:0,y:0,width:2,height:1}]},[{image:{imageId:'sprite',name:'Sprite'},sprite:{rgba:spriteRgba}}],{lines:[]},'#ff00ff');
  assert.deepStrictEqual(psdLayers.map(layer=>layer.name),['Canvas background (bottom layer)','Sprite'],'PSD order is bottom-to-top so the opaque transparent-color preview cannot cover sprite layers');
  assert.strictEqual(psdLayers[1].rgba[3],0,'source color/index 0 remains blank inside the sprite layer');
  const filler=buildTemplateFillerLayer({fillerEnabled:true,fillerColorId:'17,34,51,255',cellSize:4,showLabels:false});
  assert.strictEqual(filler.image.imageId,'ikemaker:template-filler');assert.strictEqual(filler.filler.transparentIndex,false);assert.deepStrictEqual([...filler.sprite.rgba.subarray(0,4)],[17,34,51,255],'reserved filler is an actual visible template swatch layer');
  console.log('Palette template exact alpha-visible crop tests passed');
}finally{Module._load=original}
