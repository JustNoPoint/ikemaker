'use strict';
const assert=require('assert'),vm=require('vm'),Module=require('module');
const original=Module._load;Module._load=function(name,parent,main){if(name==='vscode')return{};return original.call(this,name,parent,main)};
const {storyboardSurfaceAccessibilityClientScript,storyboardClipboardClientScript}=require('../src/storyboard_workspace');Module._load=original;

class FakeElement{
  constructor(tag='div',owner=null){this.tagName=tag.toUpperCase();this.ownerDocument=owner;this.id='';this.dataset={};this.children=[];this.parentElement=null;this.listeners={};this.attributes={};this.style={};this.className='';this.hidden=false;this.disabled=false;this.title='';this.value='';this.tabIndex=0;this.textContent='';}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='role')this.role=String(value)}
  removeAttribute(name){delete this.attributes[name]}
  addEventListener(type,listener){(this.listeners[type]||=[]).push(listener)}
  appendChild(child){child.parentElement=this;this.children.push(child);return child}
  insertBefore(child,before){child.parentElement=this;const at=this.children.indexOf(before);if(at<0)this.children.push(child);else this.children.splice(at,0,child);return child}
  querySelectorAll(selector){if(selector==='[data-i]')return this.children.filter(child=>child.dataset.i!==undefined);if(selector==='[data-layer-row]')return this.children.filter(child=>child.dataset.layerRow!==undefined);if(selector==='button:not([disabled])'||selector==='[role="menuitem"]:not([disabled])')return this.children.filter(child=>child.tagName==='BUTTON'&&!child.disabled&&(!selector.startsWith('[role')||child.role==='menuitem'));return[]}
  querySelector(selector){const data=selector.match(/^\[data-i="(\d+)"\]$/);if(data)return this.children.find(child=>child.dataset.i===data[1])||null;return this.querySelectorAll(selector)[0]||null}
  closest(selector){if(selector==='[data-layer-row]')return this.dataset.layerRow===undefined?null:this;if(selector==='#sceneClipboardMenu')return this.id==='sceneClipboardMenu'?this:this.parentElement?.closest(selector)||null;if(selector==='#scenes,.left')return this.dataset.i===undefined?null:this;if(selector==='input,textarea,select,[contenteditable=true]')return null;return null}
  focus(){this.ownerDocument.activeElement=this;this.focused=true}
  click(){this.onclick?.({currentTarget:this,target:this,preventDefault(){}})}
  getBoundingClientRect(){return{left:20,top:30,width:120,height:24}}
}
class FakeDocument{
  constructor(){this.elements=new Map();this.listeners={};this.activeElement=null;this.body=new FakeElement('body',this);this.toolbar=new FakeElement('div',this)}
  element(id,tag='button'){if(!this.elements.has(id)){const element=new FakeElement(tag,this);element.id=id;this.elements.set(id,element)}return this.elements.get(id)}
  createElement(tag){return new FakeElement(tag,this)}
  querySelector(selector){if(selector==='.left .toolbar')return this.toolbar;if(selector==='.left details .muted')return null;return null}
  addEventListener(type,listener){(this.listeners[type]||=[]).push(listener)}
}

const document=new FakeDocument(),scenes=document.element('scenes','div'),layers=document.element('layers','div');
for(const id of ['add','insertSceneComponent','manageSceneComponents','source','refresh','visualBrowser','layeredPsd','duplicate','remove','saveSceneComponent','apply','addLayer','duration','color','canvas','info','layerView','layerMenu'])document.element(id,id==='duration'||id==='color'?'input':id==='layerMenu'?'div':'button');
document.toolbar.appendChild(document.element('add'));document.toolbar.appendChild(document.element('duplicate'));document.toolbar.appendChild(document.element('remove'));
const context={document,window:{innerWidth:800,innerHeight:600},model:{scenes:[{number:0},{number:1}]},selected:0,browserPrefs:{view:'list'},data:{generation:7},vscode:{postMessage(){}},queueMicrotask:callback=>callback(),MutationObserver:class{constructor(callback){this.callback=callback}observe(){}},addEventListener(type,listener){(context.listeners[type]||=[]).push(listener)},listeners:{},globalThis:null};context.globalThis=context;
context.$=id=>document.elements.get(id)||null;context.current=()=>context.model.scenes[context.selected];
context.render=function render(){scenes.children=[];for(let index=0;index<context.model.scenes.length;index++){const node=new FakeElement('button',document);node.dataset.i=String(index);node.onclick=()=>{context.selected=index;context.render()};scenes.appendChild(node)}};
context.render();
vm.runInNewContext(storyboardSurfaceAccessibilityClientScript(),context);
vm.runInNewContext(storyboardClipboardClientScript(),context);

// A later field refresh must preserve the clipboard keyboard route instead of replacing it.
for(const listener of document.element('duration').listeners.input||[])listener({target:document.element('duration')});
let current=scenes.querySelector('[data-i="0"]');
current.onkeydown({key:'F10',shiftKey:true,preventDefault(){this.prevented=true}});
const menu=document.body.children.find(child=>child.id==='sceneClipboardMenu');
assert(menu&&!menu.hidden,'Shift+F10 still opens the scene clipboard menu after an accessibility refresh');
assert.strictEqual(document.activeElement,menu.querySelector('[role="menuitem"]:not([disabled])'),'the first available menu action receives focus');

// Busy-state refresh follows the same composition path and must preserve ContextMenu.
for(const listener of context.listeners.message||[])listener({data:{type:'storyboardBusyState',generation:7,busy:true,status:'Working'}});
current=scenes.querySelector('[data-i="0"]');menu.hidden=true;current.onkeydown({key:'ContextMenu',shiftKey:false,preventDefault(){}});
assert.strictEqual(menu.hidden,false,'ContextMenu still opens the clipboard menu after a busy-state refresh');
for(const listener of context.listeners.message||[])listener({data:{type:'storyboardBusyState',generation:7,busy:false,status:'Ready'}});

// Navigation rerenders the scene buttons; focus must land on the new live selected node.
menu.hidden=true;current=scenes.querySelector('[data-i="0"]');const detached=current;
current.onkeydown({key:'ArrowDown',shiftKey:false,preventDefault(){this.prevented=true}});
const live=scenes.querySelector('[data-i="1"]');
assert.strictEqual(context.selected,1);assert.notStrictEqual(live,detached,'scene selection rerendered the row');assert.strictEqual(document.activeElement,live,'focus is re-queried and moved to the live selected row');
console.log('Storyboard combined accessibility and clipboard client keyboard regressions passed');
