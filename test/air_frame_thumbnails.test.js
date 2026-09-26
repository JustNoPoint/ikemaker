'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/air_viewer.js'),'utf8');
const start=source.indexOf('function updateFrameThumbnail('),end=source.indexOf('function renderStrip(',start);
assert(start>=0&&end>start);
function element(tag){return {tag,children:[],attributes:{},textContent:'',replaceChildren(){this.children=[];this.textContent='';},append(child){this.children.push(child);},setAttribute(k,v){this.attributes[k]=v;}};}
const thumbs=new Map([[0,'data:image/png;base64,test']]),sandbox={thumbs,document:{createElement:element}};
vm.runInNewContext(source.slice(start,end),sandbox);
const holder=element('span');
// Negative groups are intentionally blank even if an old cached thumbnail exists.
sandbox.updateFrameThumbnail(holder,{group:-1,index:0},0);
assert.strictEqual(holder.textContent,'Blank');assert.strictEqual(holder.children.length,0);
sandbox.updateFrameThumbnail(holder,{group:9,index:9,spriteMissing:true},0);
assert.strictEqual(holder.textContent,'Missing');assert.strictEqual(holder.children.length,0);
sandbox.updateFrameThumbnail(holder,{group:0,index:1},1);
assert.strictEqual(holder.textContent,'Loading…');assert.strictEqual(holder.children.length,0);
sandbox.updateFrameThumbnail(holder,{group:0,index:0},0);
assert.strictEqual(holder.children.length,1);assert.strictEqual(holder.children[0].src,thumbs.get(0));
holder.children[0].onerror();assert.strictEqual(holder.children.length,0);assert.strictEqual(holder.textContent,'Unavailable');
assert.strictEqual(holder.attributes['aria-label'],'Could not display sprite 0,0');
// A later refresh can recover a failed thumbnail.
sandbox.updateFrameThumbnail(holder,{group:0,index:0},0);assert.strictEqual(holder.children.length,1);
console.log('AIR frame thumbnails distinguish blank, missing, loading and failed images');
