'use strict';

const fs = require('fs');
const path = require('path');
const { LIMITS, buildCollective } = require('./palette_collective_model');

function key(filename) { return process.platform === 'win32' ? filename.toLowerCase() : filename; }
function within(root, filename) { const relative = path.relative(root, filename); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); }
function pngHeader(io, filename) { const handle=io.openSync(filename,'r');try{const header=Buffer.alloc(33),read=io.readSync(handle,header,0,header.length,0);if(read<33||header.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||header.toString('ascii',12,16)!=='IHDR')throw new Error(`${path.basename(filename)} is not a valid PNG image.`);}finally{io.closeSync(handle);} }

function readCollectivePaths(paths, options = {}) {
  const io=options.fs||fs,limits=options.limits||LIMITS,requested=Array.isArray(paths)?paths:[];
  if(!requested.length)throw new Error('Choose at least one PNG image.');if(requested.length>limits.maximumImages)throw new Error(`Palette collective exceeds the ${limits.maximumImages}-image limit.`);
  const root=options.root?io.realpathSync(path.resolve(options.root)):null,seen=new Set(),approved=[];let total=0;
  for(const requestedPath of requested){const unresolved=path.resolve(requestedPath),link=io.lstatSync(unresolved);if(link.isSymbolicLink())throw new Error(`Palette collective rejects symbolic links: ${unresolved}`);const filename=io.realpathSync(unresolved),stat=io.statSync(filename);if(!stat.isFile())throw new Error(`Palette collective source is not a regular file: ${filename}`);if(root&&!within(root,filename))throw new Error(`Palette collective source escaped the selected folder: ${filename}`);if(!/\.png$/i.test(filename))throw new Error(`Palette collective accepts PNG files only: ${filename}`);const identity=key(filename);if(seen.has(identity))throw new Error(`Duplicate collective image: ${filename}`);seen.add(identity);if(stat.size>limits.maximumFileBytes)throw new Error(`${path.basename(filename)} exceeds the ${limits.maximumFileBytes}-byte limit.`);total+=stat.size;if(total>limits.maximumTotalBytes)throw new Error(`Palette collective exceeds the ${limits.maximumTotalBytes}-byte encoded limit.`);pngHeader(io,filename);approved.push({filename,size:stat.size,modifiedTimeMs:stat.mtimeMs});}
  const files=approved.map(item=>{const buffer=io.readFileSync(item.filename);if(buffer.length!==item.size)throw new Error(`Palette collective source changed while it was read: ${item.filename}`);return{filename:item.filename,buffer,modifiedTimeMs:item.modifiedTimeMs};});
  return buildCollective(files,limits);
}

function scanFolder(folder, options = {}) {
  const io=options.fs||fs,requestedRoot=path.resolve(folder),rootStat=io.lstatSync(requestedRoot);
  if(rootStat.isSymbolicLink())throw new Error('Palette collective folder must be a real directory, not a symlink or junction.');
  const root=io.realpathSync(requestedRoot);if(!io.statSync(root).isDirectory())throw new Error('Palette collective folder must be a real directory, not a symlink or junction.');
  const paths=[];let visitedEntries=0;
  const visit=directory=>{
    const entries=io.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));visitedEntries+=entries.length;
    if(visitedEntries>4096)throw new Error('Selected folder tree contains too many entries to scan safely.');
    for(const entry of entries){const unresolved=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Palette collective folder tree contains a symlink or junction.');const link=io.lstatSync(unresolved);if(link.isSymbolicLink())throw new Error('Palette collective folder tree contains a symlink or junction.');const resolved=io.realpathSync(unresolved);if(!within(root,resolved))throw new Error('Palette collective folder entry escaped the selected folder.');if(entry.isDirectory()){visit(resolved);continue}if(!/\.png$/i.test(entry.name))continue;if(!entry.isFile()||!io.statSync(resolved).isFile())throw new Error('Palette collective folder contains a PNG symlink, junction, or non-regular entry.');paths.push(resolved)}
  };
  visit(root);paths.sort((a,b)=>path.relative(root,a).localeCompare(path.relative(root,b)));
  if(!paths.length)throw new Error('The selected folder and its subfolders contain no PNG files.');
  return readCollectivePaths(paths,{...options,root});
}

module.exports={within,pngHeader,readCollectivePaths,scanFolder};
