'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/air_viewer.js'),'utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
let state={actionSort:'name',otherPreference:true};const elements=new Map();
const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',classList:{remove(){}},append(){}});return elements.get(id);},createElement:()=>({})};
const actions=[{number:990,frames:[{}]},{number:991,frames:[{}]}];
const model={airPath:'fixture.air',title:'Fixture',actions,palettePreview:{assignedDefault:{group:0,number:0}},palettes:[]};
const box={model,action:null,frameIndex:0,saved:{airPath:'fixture.air',activeAction:991},vscode:{getState:()=>state,setState:s=>state=s},selectedActions:new Set([991]),document,thumbs:new Map(),selectedFrames:new Set(),canvas:{classList:{remove(){}}},imageCache:new Map(),renderBoxEditor(){},renderActions(){},renderStrip(){},requestFrame(){},schedule(){}};
vm.runInNewContext(extract('function saveAirView(', 'saveAirView();'),box);
vm.runInNewContext(extract('function selectAction(', 'function navigationAllowed('),box);
vm.runInNewContext(extract('function applyModel(', "window.addEventListener('message'"),box);
box.applyModel(model);assert.equal(box.action.number,991);assert.equal(state.activeAction,991);assert.equal(state.actionSort,'name');assert(state.otherPreference);
box.selectAction(990);assert.equal(state.activeAction,990);box.applyModel(model);assert.equal(box.action.number,990,'source refresh retains live selection');
box.action=null;box.saved.activeAction=999;box.applyModel(model);assert.equal(box.action.number,990,'deleted saved action falls back safely');
box.action=null;box.saved.airPath='another.air';box.saved.activeAction=991;box.applyModel(model);assert.equal(box.action.number,990,'saved selection is owner-specific');
console.log('AIR selected action survives restoration and refresh without clobbering other state');
