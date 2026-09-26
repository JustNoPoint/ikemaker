 'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-font-'));
try{
 fs.mkdirSync(path.join(root,'font'));fs.mkdirSync(path.join(root,'data'));
 const motif=path.join(root,'data','system.def');
 fs.writeFileSync(path.join(root,'font','names.def'),'[FNT v2]\nfntversion=2,00\n[Def]\nType=bitmap\nSize=14,17\nSpacing=-9,4\nOffset=2,3\nFile=glyphs.sff\n');
 fs.writeFileSync(path.join(root,'font','glyphs.sff'),'fixture');
 const original=Module._load;Module._load=function(name,parent,main){if(name==='./sff_reader'&&parent.filename.endsWith('ui_font_preview.js'))return{readSff:()=>({sprites:[{group:0,number:65,width:15,height:17,axisX:1,axisY:2},{group:2,number:65,width:20,height:20}]}),spriteDataUri:()=> 'data:image/png;base64,fixture'};return original.call(this,name,parent,main)};
 const {loadFontPreview}=require('../src/ui_font_preview');Module._load=original;
 const font=loadFontPreview('names.def',motif,root);
 assert.strictEqual(font.state,'bitmap');assert.deepStrictEqual(font.size,[14,17]);assert.deepStrictEqual(font.spacing,[-9,4]);assert.deepStrictEqual(Object.keys(font.glyphs),['65']);assert.strictEqual(font.glyphs[65].axisX,1);
 assert.strictEqual(loadFontPreview('missing.def',motif,root).state,'approximate');
 fs.writeFileSync(path.join(root,'font','legacy.fnt'),'legacy');assert.strictEqual(loadFontPreview('legacy.fnt',motif,root).reason,'Legacy FNT font');
 console.log('Bitmap font preview resolution tests passed');
}finally{fs.rmSync(root,{recursive:true,force:true})}
