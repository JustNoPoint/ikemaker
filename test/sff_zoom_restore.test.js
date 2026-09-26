'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/sff_viewer.js'),'utf8');
function line(marker){const start=source.indexOf(marker);assert(start>=0);return source.slice(start,source.indexOf('\n',start));}
let state={otherPreference:'latest'};
const elements=new Map(),element=()=>({value:'',checked:false,append(){}});
const document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
const sprite={index:1,group:1,number:0,axisX:26,axisY:101,references:[],aliases:[]};
const box={document,model:{fullPath:'fixture.sff',sprites:[{},sprite],palettes:[]},vscode:{getState:()=>state,setState:s=>state=s},visibility:{},widths:{},onionIndex:0,viewOffsetX:20,viewOffsetY:10,zoomScale:4.66,selected:sprite,group:1,organizerBucket:'',organizeMode:element(),paletteSort:element(),selectedIndices:new Set(),error:element(),details:element(),refs:element(),importedPaletteColors:null,reviewFor:()=>({}),displayedSystemName:()=>'',profileEnabled:()=>false,effectivePalette:()=>0,fitForSprite:()=>4.66};
for(const name of ['redraw','renderGroups','renderSprites','loadReview','renderAnimationChoices','previewStatus','requestCurrentSprite','requestLayers'])box[name]=()=>{};
for(const marker of ['function saveViewState(', 'function setZoom(', 'function selectSprite('])vm.runInNewContext(line(marker),box);
box.setZoom(1);assert.equal(state.zoomScale,1);assert.equal(state.otherPreference,'latest');assert.equal(document.getElementById('zoomValue').textContent,'100%');
const persisted=JSON.parse(JSON.stringify(state));
box.zoomScale=1;box.selectSprite(sprite,persisted.zoomScale);assert.equal(box.zoomScale,1,'reload restores chosen zoom');assert.equal(state.viewOffsetX,20);assert.equal(state.viewOffsetY,10);
box.selectSprite(sprite);assert.equal(box.zoomScale,4.66,'ordinary selection still fits');
box.selectSprite(sprite,NaN);assert.equal(box.zoomScale,4.66);box.selectSprite(sprite,-1);assert.equal(box.zoomScale,4.66);
box.setZoom(Infinity);assert.equal(state.zoomScale,1,'invalid zoom cannot poison saved state');box.setZoom(20);assert.equal(state.zoomScale,8);
const startup=source.match(/selectSprite\(first,([^;]+?)\)\}window/)[1];
for(const [restored,saved,expected] of [[sprite,{filename:'fixture.sff',zoomScale:2},2],[sprite,{filename:'other.sff',zoomScale:2},undefined],[undefined,{filename:'fixture.sff',zoomScale:2},undefined]]){
  assert.equal(vm.runInNewContext(startup,{restored,saved,model:box.model}),expected,'restoration requires the same archive and a surviving selection');
}
console.log('SFF zoom: saved 100%, restored selection, fresh preferences, owner guard and normal auto-fit passed');
