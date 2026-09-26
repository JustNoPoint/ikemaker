'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../src/viewer_layout.js'),'utf8');
const nodes=new Map(),styles=[],messages=[];let receive;
function node(){return{dataset:{},style:{setProperty(name,value){this[name]=value;}},value:'',checked:false,innerHTML:'',append(){},insertBefore(){},replaceChildren(){},setAttribute(){},toggleAttribute(name,value){this[name]=value;},showModal(){this.open=true;},close(){this.open=false;},querySelector:find};}
function find(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);}
find('[data-toolbar-surface]').dataset.toolbarSurface='snd';
const sandbox={document:{currentScript:{nonce:'sound-nonce'},querySelector:find,createElement:node,head:{append:style=>styles.push(style)},body:{append(){}}},vscode:{postMessage:m=>messages.push(m)},addEventListener:(type,fn)=>receive=fn};
vm.runInNewContext(source.slice(source.indexOf('function client(){'),source.indexOf('function spriteClient(){'))+';client();',sandbox);
assert.strictEqual(styles.length,2);assert(styles.every(style=>style.nonce==='sound-nonce'),'both shared and sound-specific styles satisfy nonce-only CSP');
const presets=require('../src/viewer_layout').presets('snd');receive({data:{type:'viewerLayoutState',surface:'snd',current:presets.Default,presets,savedLayouts:{}}});
find('[data-viewer-layout]').onclick();find('#viewer-layout-right').checked=false;find('#viewer-layout-apply').onclick();
assert.strictEqual(messages.at(-1).layout.right,false);assert.strictEqual(messages.at(-1).layout.groups,true);
receive({data:{type:'viewerLayoutState',surface:'snd',current:messages.at(-1).layout,presets,savedLayouts:{},saved:true}});
assert.strictEqual(find('.workspace').dataset.viewerLayoutSurface,'snd','responsive AIR/JNP rules must not alter SND');
assert.strictEqual(find(':scope > .right')['data-layout-hidden'],true);assert.strictEqual(find('.workspace').style['--viewer-right-width'],'0px');
assert.strictEqual(find(':scope > aside:first-child')['data-layout-hidden'],false);
// Reopening must not falsely select Default when the current arrangement is customized.
find('#viewer-layout-preset').value='Default';find('[data-viewer-layout]').onclick();
assert.strictEqual(find('#viewer-layout-preset').value,'');
assert.strictEqual(find('#viewer-layout-right').checked,false);
find('#viewer-layout-preset').value='Default';find('#viewer-layout-preset').onchange();
assert.strictEqual(find('#viewer-layout-right').checked,false,'Default can be selected immediately after reopening');
find('#viewer-layout-apply').onclick();assert.strictEqual(messages.at(-1).layout.right,false);
console.log('Shared/SND layout CSP, dialog values and hidden-panel sizing passed');
