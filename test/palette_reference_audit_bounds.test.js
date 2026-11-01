'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const { referenceFiles, auditPaletteReferences }=require('../src/palette_reference_audit');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-palette-ref-bounds-'));
try{
  fs.writeFileSync(path.join(root,'small.zss'),'let p = 1,1;\n');
  fs.writeFileSync(path.join(root,'large.zss'),'x'.repeat(2048));
  const files=referenceFiles(root,2000,{maxFileBytes:1024,maxTotalBytes:4096});
  assert.strictEqual(files.length,1);
  assert.strictEqual(path.basename(files[0].filename),'small.zss');
  assert.strictEqual(files.summary.skippedLarge,1);
  assert.strictEqual(files.summary.incomplete,true);
  assert(files.summary.totalBytes<=files.summary.maxTotalBytes);
  const exact=Array.from({length:4096},()=>"remappal = 1, 8").join('\n'),exactAudit=auditPaletteReferences([{filename:path.join(root,'exact.zss'),text:exact}],[{from:{group:1,number:8},to:{group:1,number:6}}],{maxFindings:4096,maxOccurrences:4096});
  assert.strictEqual(exactAudit.incomplete,false,'exactly 4096 reviewable findings fit the inclusive boundary');
  assert.strictEqual(exactAudit.findingCount,4096);
  assert.strictEqual(exactAudit.occurrenceCount,4096);
  const repeated=exact+'\nremappal = 1, 8',audit=auditPaletteReferences([{filename:path.join(root,'many.zss'),text:repeated}],[{from:{group:1,number:8},to:{group:1,number:6}}],{maxFindings:4096,maxOccurrences:4096});
  assert.strictEqual(audit.incomplete,true,'the scanner reports an incomplete review as soon as the aggregate occurrence cap is reached');
  assert(audit.findingCount<=4096,'the retained findings never exceed the hard cap');
  assert(audit.occurrenceCount<=4096,'the scanner never materializes occurrences beyond the hard cap');
  const nested=path.join(root,'nested');fs.mkdirSync(nested);fs.writeFileSync(path.join(nested,'hidden.zss'),'remappal = 1, 8');
  const originalReaddir=fs.readdirSync;fs.readdirSync=(folder,options)=>path.resolve(folder)===path.resolve(nested)?(()=>{throw new Error('denied')})():originalReaddir(folder,options);
  try{const unreadable=referenceFiles(root);assert.strictEqual(unreadable.summary.incomplete,true);assert(unreadable.summary.skippedUnsafe>=1,'an unreadable directory blocks completeness')}finally{fs.readdirSync=originalReaddir}
  const link=path.join(root,'linked-folder');try{fs.symlinkSync(nested,link,'junction');const linked=referenceFiles(root);assert.strictEqual(linked.summary.incomplete,true);assert(linked.summary.skippedUnsafe>=1,'a linked directory blocks completeness')}catch(error){if(!['EPERM','EACCES','ENOTSUP'].includes(error.code))throw error}
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log('palette reference audit bounds tests passed');
