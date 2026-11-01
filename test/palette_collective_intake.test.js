'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {encodeRgbaPng,LIMITS}=require('../src/palette_collective_model');
const {readCollectivePaths,scanFolder}=require('../src/palette_collective_intake');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'palette-intake-'));
try{
 assert(LIMITS.maximumImages>=4096,'full character template intake must support thousands of small files while retaining byte and pixel guards');
 assert(LIMITS.maximumPixels>=256_000_000,'full character template intake must admit large sprite collections while retaining an aggregate decoded-pixel guard');
 const b=path.join(root,'b.png'),a=path.join(root,'a.png'),png=encodeRgbaPng(1,1,Buffer.from([1,2,3,255]));fs.writeFileSync(b,png);fs.writeFileSync(a,png);fs.writeFileSync(path.join(root,'ignored.txt'),'x');
 const explicit=readCollectivePaths([b,a]);assert.deepStrictEqual(explicit.evidence.map(x=>path.basename(x.filename)),['b.png','a.png'],'explicit order is retained');
 const folder=scanFolder(root);assert.deepStrictEqual(folder.evidence.map(x=>path.basename(x.filename)),['a.png','b.png'],'folder order is deterministic');
 const nested=path.join(root,'selected-after-navigation');fs.mkdirSync(nested);fs.writeFileSync(path.join(nested,'c.png'),png);const recursive=scanFolder(root);assert.deepStrictEqual(recursive.evidence.map(x=>path.relative(root,x.filename).replace(/\\/g,'/')),['a.png','b.png','selected-after-navigation/c.png'],'folder scan includes PNG files below a folder selected after navigating into and back out of it');
 assert.throws(()=>readCollectivePaths([a,a]),/Duplicate/);
 let fullReads=0;const counted=Object.create(fs);counted.readFileSync=(...args)=>{fullReads++;return fs.readFileSync(...args)};assert.throws(()=>readCollectivePaths([a,b],{fs:counted,limits:{...LIMITS,maximumTotalBytes:png.length*2-1}}),/encoded limit/);assert.strictEqual(fullReads,0,'aggregate stat limit must fail before full reads');
 const fake=Object.create(fs);fake.lstatSync=()=>({isSymbolicLink:()=>true});let touched=false;fake.realpathSync=()=>{touched=true;return a};assert.throws(()=>readCollectivePaths([a],{fs:fake}),/symbolic links/);assert.strictEqual(touched,false,'symlink must fail before realpath/read');
 const folderFake=Object.create(fs);folderFake.readdirSync=()=>[{name:'linked.png',isFile:()=>false,isSymbolicLink:()=>true}];assert.throws(()=>scanFolder(root,{fs:folderFake}),/symlink or junction/,'folder PNG links must be rejected, not silently skipped');
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log('Palette collective explicit/folder containment, ordering, symlink, dedupe, and pre-read limit tests passed');
