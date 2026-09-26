const assert=require('assert'),vm=require('vm'),accessibility=require('../src/webview_accessibility');
const events={};let focused,prevented=0;
function button(name,active=false){return {id:'',dataset:{view:name},attrs:{},classList:{contains:()=>active},setAttribute(key,value){this.attrs[key]=value;},click(){for(const other of buttons)other.classList.contains=()=>other===this;},focus(){focused=this;}};}
const buttons=[button('first',true),button('hidden'),button('last')];buttons[1].hidden=true;
const panel={id:'content',attrs:{},setAttribute(key,value){this.attrs[key]=value;}};
const bar={attrs:{},querySelectorAll:()=>buttons,setAttribute(key,value){this.attrs[key]=value;},hasAttribute:key=>key in bar.attrs,addEventListener:(type,handler)=>events[type]=handler};
const env={document:{querySelectorAll:()=>[bar],getElementById:id=>id==='content'?panel:null},queueMicrotask:fn=>fn()};vm.runInNewContext(accessibility.clientScript(),env);
assert.equal(bar.attrs.role,'tablist');assert.equal(buttons[0].attrs['aria-selected'],'true');assert.equal(buttons[2].tabIndex,-1);
events.keydown({target:buttons[0],key:'ArrowRight',preventDefault:()=>prevented++});assert.equal(focused,buttons[2]);assert.equal(buttons[2].attrs['aria-selected'],'true');assert.equal(buttons[0].attrs['aria-selected'],'false');assert.equal(panel.attrs['aria-labelledby'],buttons[2].id);
events.keydown({target:buttons[2],key:'Home',preventDefault:()=>prevented++});assert.equal(focused,buttons[0]);assert.equal(prevented,2);
events.keydown({target:buttons[0],key:'ArrowRight',altKey:true,preventDefault:()=>prevented++});assert.equal(prevented,2);
console.log('Shared tab semantics, hidden-tab skipping, arrow/Home navigation and focus passed');
