'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),path=require('path');
const text=fs.readFileSync(path.join(__dirname,'../src/viewer_layout.js'),'utf8');
const nodes=new Map();
function node(){return{style:{},value:'',checked:false,append(){},replaceChildren(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},querySelector:find};}
function find(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);}
const posted=[];let receive,applies=0;
const state=require('../src/viewer_layout').presets('sff').Default;
const styles=[];
const sandbox={document:{currentScript:{nonce:'test-nonce'},head:{append:style=>styles.push(style)},querySelector:find,createElement:node,body:{append(){}}},vscode:{postMessage:m=>posted.push(m)},addEventListener:(type,fn)=>receive=fn};
sandbox.ikemenSpriteLayout={read:()=>state,apply:()=>{applies++;sandbox.ikemenSpriteLayoutChanged();}};
vm.runInNewContext(text.slice(text.indexOf('function spriteClient(){'),text.indexOf('module.exports='))+';spriteClient();',sandbox);
assert.strictEqual(posted.length,1);assert.strictEqual(posted[0].type,'viewerLayoutReady');
assert.strictEqual(styles[0].nonce,'test-nonce','dynamic dialog styles honor SFF CSP');assert.match(styles[0].textContent,/input\[type=checkbox\]/);
receive({data:{type:'viewerLayoutState',surface:'sff',current:state,presets:{Default:state},savedLayouts:{}}});
assert.strictEqual(applies,1);assert.strictEqual(posted.length,1,'applying host state does not echo another save');
state.panes.left2.visible=false;sandbox.ikemenSpriteLayoutChanged();assert.strictEqual(posted.at(-1).type,'viewerLayoutSave');assert.strictEqual(posted.at(-1).layout.panes.left2.visible,false);
find('[data-viewer-layout]').onclick();assert.strictEqual(find('[data-visible="left2"]').checked,false,'dialog reads the native current pane state');
find('#sprite-layout-name').value='Cleanup';find('#sprite-layout-save').onclick();assert.strictEqual(posted.at(-1).name,'Cleanup');
receive({data:{type:'viewerLayoutError',message:'disk unavailable'}});assert.strictEqual(find('#sprite-layout-status').textContent,'disk unavailable');
find('[data-viewer-layout-reset]').onclick();assert.strictEqual(posted.at(-1).type,'viewerLayoutReset');
console.log('SFF layout bridge native synchronization, dialog capture, reset and no feedback loop passed');
