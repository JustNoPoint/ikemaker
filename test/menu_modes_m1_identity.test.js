'use strict';
const assert=require('assert'),Module=require('module'),path=require('path'),original=Module._load;
const vscode={workspace:{},window:{}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main);};
const menu=require('../src/menu_modes_workspace');
function doc(filename,text){const lines=text.split(/\r?\n/);return{fileName:filename,uri:{toString:()=>`file:///${filename.replace(/\\/g,'/')}`},version:1,getText:()=>text,lineCount:lines.length,lineAt:index=>({text:lines[index]||''})};}
const system=doc('C:/game/data/system.def','[Files]\nspr = system.sff\n[Title Info]\nmenu.itemname.arcade = ARCADE\nmenu.itemname.versus = VS MODE\n'),select=doc('C:/game/data/select.def','[Characters]\nRyu/Ryu.def\n[Options]\narcade.maxmatches = 1\n');
const model={menu:[{key:'menu.itemname.arcade',label:'ARCADE',line:3},{key:'menu.itemname.versus',label:'VS MODE',line:4}],options:[{name:'arcade.maxmatches',line:3}]};
const records=menu.menuModeRecords(system,select,model),reference=records[0].reference;
assert(Object.isFrozen(reference));assert.deepStrictEqual(Object.keys(reference),['type','uri','sourceRole','section','recordKind','normalizedKey','rawSignatureSha','occurrence','matchCount']);assert(menu.validMenuModeReference(reference));assert.strictEqual(reference.normalizedKey,'menu.itemname.arcade');
const shifted=doc('C:/game/data/system.def','; unrelated\n'+system.getText()),shiftedModel={...model,menu:model.menu.map(item=>({...item,line:item.line+1}))};assert(menu.findMenuModeRecord(shifted,select,shiftedModel,reference),'unrelated preceding line shifts preserve identity');
const changed=doc('C:/game/data/system.def',system.getText().replace('ARCADE','ARCADE MODE'));assert.strictEqual(menu.findMenuModeRecord(changed,select,model,reference),null,'raw record changes fail closed');
const duplicate=doc('C:/game/data/system.def',system.getText()+'menu.itemname.arcade = ARCADE\n'),duplicateModel={...model,menu:[...model.menu,{key:'menu.itemname.arcade',label:'ARCADE',line:5}]};assert.strictEqual(menu.findMenuModeRecord(duplicate,select,duplicateModel,reference),null,'duplicate count changes fail closed');
for(const forged of [{...reference,line:3},{...reference,sourceRole:'select'},{...reference,rawSignatureSha:'x'.repeat(64)},{...reference,matchCount:0}])assert(!menu.validMenuModeReference(forged));
Module._load=original;console.log('Menu Modes M1 frozen record identity survives line shifts and fails closed on content, duplicate, and schema changes');
