'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const scan=require('../src/palette_bulk_gallery_scan'),{writeAct}=require('../src/act_palette_order');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-gallery-scan-'));
try{const group=path.join(root,'heroes');fs.mkdirSync(group);const colors=Array.from({length:256},(_,i)=>[i,i,i,i?255:0]);fs.writeFileSync(path.join(group,'0001-ryu.act'),writeAct(colors));fs.writeFileSync(path.join(group,'0001-ryu.gpl'),'GIMP Palette\n');fs.writeFileSync(path.join(group,'0003-ken.act'),writeAct(colors));const result=scan.scan(root);assert.strictEqual(result.inventory.entries.length,3);assert.deepStrictEqual(result.inventory.gaps,[{folder:'heroes',number:2}]);assert.strictEqual(result.inventory.duplicateNumbers.length,0);assert.strictEqual(result.inventory.duplicateColors.length,1);const deep=path.join(group,'nested');fs.mkdirSync(deep);assert.throws(()=>scan.scan(root),/non-recursive/)}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log('Palette gallery bounded non-recursive scanner and companion-bundle tests passed');
