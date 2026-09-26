'use strict';
const assert=require('assert'),vm=require('vm');const {clientScript}=require('../src/connection_selection');let click;
const nodes=[{dataset:{file:'C:/Game/a.zss',line:'2'},setAttribute(name,value){this[name]=value;}},{dataset:{file:'C:/Game/b.zss',line:'9'},setAttribute(name,value){this[name]=value;}}],branches=[{dataset:{branch:'a.zss'},open:true},{dataset:{branch:'b.zss'},open:false}];
const doc={scrollingElement:{scrollTop:120},querySelectorAll:selector=>selector==='[data-file]'?nodes:branches,addEventListener:(type,fn)=>click=fn};const box={document:doc};vm.createContext(box);vm.runInContext(clientScript(),box);
click({target:{closest:()=>nodes[1]}});const saved=box.ikemenNavigationSelection();assert.equal(saved.file,'C:/Game/b.zss');assert.equal(saved.line,9);assert.deepEqual([...saved.closedBranches],['b.zss']);assert.equal(saved.scrollTop,120);
branches[0].open=false;branches[1].open=true;doc.scrollingElement.scrollTop=0;box.ikemenRestoreNavigation(saved);assert(branches[0].open);assert(!branches[1].open);assert.equal(nodes[1]['aria-current'],'true');assert.equal(doc.scrollingElement.scrollTop,120);
assert(!box.ikemenCanRestoreNavigation({...saved,file:'missing'}));assert.throws(()=>box.ikemenRestoreNavigation({...saved,closedBranches:['missing']}),/no longer available/);assert.equal(doc.scrollingElement.scrollTop,120);
console.log('Connection presets retain source row, branch visibility and scroll, and reject unavailable destinations without altering the page');
