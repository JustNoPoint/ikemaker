'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
// Stage every payload before replacing any destination. Retain backups until the
// complete font pair is installed, and restore them if a later replacement fails.
function writeFontFiles(files,io=fs){
 const token=crypto.randomBytes(10).toString('hex'),records=files.map(({filename,data})=>({filename,data,temp:filename+'.fontlab-'+token+'.tmp',backup:filename+'.fontlab-'+token+'.bak',existed:io.existsSync(filename),backed:false,installed:false}));
 if(new Set(records.map(r=>path.resolve(r.filename).toLowerCase())).size!==records.length)throw Error('Font output destinations must be distinct.');
 try{
  for(const r of records)io.writeFileSync(r.temp,r.data,{flag:'wx'});
  for(const r of records){if(r.existed){io.renameSync(r.filename,r.backup);r.backed=true;}io.renameSync(r.temp,r.filename);r.installed=true;}
 }catch(error){const failures=[];for(const r of [...records].reverse()){try{if(r.installed)io.unlinkSync(r.filename);if(r.backed)io.renameSync(r.backup,r.filename);}catch(rollback){failures.push(r.filename+': '+rollback.message);}}if(failures.length)throw Error(error.message+'; restoration needs attention: '+failures.join('; '));throw error;
 }finally{for(const r of records){try{if(io.existsSync(r.temp))io.unlinkSync(r.temp);}catch(_){}}}
 for(const r of records)if(r.backed)io.unlinkSync(r.backup);
}
function conversionWarning(preview){if(preview.archiveFile)return '';const banks=preview.banks||[0],indexed=preview.indexedGlyphs&&Object.keys(preview.indexedGlyphs).length===Object.keys(preview.glyphs||{}).length;if(banks.length>1&&!indexed)return 'This conversion exports only the selected bank; '+banks.length+' source banks cannot be retained. Save under a new name to keep the original font.';return '';}
module.exports={writeFontFiles,conversionWarning};
