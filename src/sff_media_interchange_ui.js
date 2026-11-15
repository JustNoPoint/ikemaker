'use strict';
const fs = require('fs');
const path = require('path');
const {exportArchive,planImport,validateSources} = require('./sff_media_interchange');
const {hash} = require('./mutation_safety');

function readBounded(file,limit) {
  const info=fs.statSync(file);
  if(!info.isFile()||info.size>limit)throw new Error(`The source must be a file of at most ${limit/1024/1024} MB: ${file}`);
  const bytes=fs.readFileSync(file);
  if(bytes.length>limit)throw new Error('The source grew past its reviewed size limit.');
  return bytes;
}

async function showReview(vscode, title, detail) {
  return require('./sff_readonly_review').review(vscode,{
    title:'SFF Sprite and Palette Manifest Review',content:detail,
    confirm:()=>vscode.window.showWarningMessage(title,{modal:true,detail},'Apply Reviewed Import')
  });
}

async function run(vscode, filename, archive, action, hooks) {
  const isCurrent=()=>hooks.isCurrent()&&hash(fs.readFileSync(filename))===hash(archive.buffer);
  if(!isCurrent())throw new Error('The SFF changed. Refresh before opening interchange.');
  if(action==='exportMediaIni') {
    const pack=exportArchive(archive);
    const chosen=await vscode.window.showOpenDialog({title:'Export SFF sprites and palettes — choose an empty folder',canSelectFolders:true,canSelectFiles:false,canSelectMany:false,defaultUri:vscode.Uri.file(path.dirname(filename))});
    if(!chosen?.[0])return;
    const folder=chosen[0].fsPath,writes=[...pack.files].map(([name,data])=>[path.join(folder,name),data]);
    if(writes.some(([file])=>fs.existsSync(file)))throw new Error('Choose an empty export folder. Existing files are not replaced.');
    const detail=[`Source: ${filename}`,`Destination: ${folder}`,`${archive.sprites.length} sprites, ${archive.palettes.length} palettes, ${writes.length} files.`,
      'Axes and assigned palettes are included. Actual shared image/palette owners reuse one file; independent equal-color palettes stay separate. Archive order is retained. Indexed PNGs preserve index separation; RGBA palettes preserve alpha and color count.',
      ...pack.entries.map(entry=>`${entry.type} ${entry.group},${entry.index} → ${entry.file}${entry.axis?` · axis ${entry.axis.x},${entry.axis.y}`:''}${entry.palette?` · palette ${entry.palette.group},${entry.palette.index}`:''}`)].join('\n');
    const answer=await vscode.window.showWarningMessage('Export this reviewed sprite/palette manifest?',{modal:true,detail},'Export Manifest');
    if(answer!=='Export Manifest')return;
    if(!isCurrent())throw new Error('The SFF changed during export review. No files were written.');
    hooks.writeSet(writes);
    vscode.window.showInformationMessage(`Exported ${pack.entries.length} ordered sprite/palette entries to ${path.join(folder,'manifest.txt')}.`);
    return;
  }
  const chosen=await vscode.window.showOpenDialog({title:'Review SFF sprite/palette INI import',canSelectFiles:true,canSelectMany:false,filters:{'Sprite and palette manifests':['txt','ini']},defaultUri:vscode.Uri.file(path.dirname(filename))});
  if(!chosen?.[0])return;
  const manifestFile=chosen[0].fsPath,bytes=readBounded(manifestFile,2*1024*1024);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const plan=planImport(archive,text,manifestFile,file=>readBounded(file,16*1024*1024));
  // Keep the fingerprint of the original bytes, including a possible UTF-8 BOM.
  plan.manifestHash=hash(bytes);
  const detail=[`Source manifest: ${manifestFile}`,`Destination SFF: ${filename}`,
    `${plan.summary.sprites} sprite rows and ${plan.summary.palettes} palette rows imported. ${plan.ignored} unrelated entries ignored.`,
    `${plan.summary.sharedImages} imported image links and ${plan.summary.sharedPalettes} imported palette links are explicit repeated-file references.`,
    'Existing physical order is retained; new identities append in manifest order. Unlisted shared users keep original data. Explicit imported palette IDs retain index values without color matching. Applying saves the SFF with its configured backup/history policy.',
    ...plan.changes.map(change=>`${change.type} ${change.identity}: ${change.action}${change.file?` · ${change.file}`:''}${change.axis?` · axis ${change.axis.x},${change.axis.y}`:''}${change.palette?` · palette ${change.palette.group},${change.palette.index}`:''}${change.image?' · '+change.image:''}${change.paletteStorage?' · '+change.paletteStorage:''}${change.colorChanges?.length?'\n'+change.colorChanges.map(color=>`  color ${color.index}: ${color.before?.join(',')||'absent'} → ${color.after?.join(',')||'absent'}`).join('\n'):''}`)].join('\n');
  const answer=await showReview(vscode,'Apply this reviewed sprite/palette manifest import?',detail);
  if(answer!=='Apply Reviewed Import')return;
  if(!isCurrent())throw new Error('The originating SFF changed or closed during review. Nothing was written.');
  validateSources(plan,file=>readBounded(file,file===manifestFile?2*1024*1024:16*1024*1024));
  await hooks.apply(plan);
  vscode.window.showInformationMessage(`Imported ${plan.summary.sprites} sprite rows and ${plan.summary.palettes} palette rows. The SFF has been saved.`);
  return plan;
}

module.exports={run};
