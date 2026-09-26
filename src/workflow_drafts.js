'use strict';
const fs=require('fs'),path=require('path');
const {hash,transactionalWriteSet}=require('./mutation_safety');
const KEY='ikemaker.workflowDrafts.v1';
const key=file=>path.resolve(file).toLowerCase();
class WorkflowDrafts {
  constructor(storage){this.storage=storage;this.entries=storage?.get(KEY,{})||{};}
  read(file,fallback){const entry=this.entries[key(file)];return entry?JSON.parse(JSON.stringify(entry.value)):fallback;}
  has(file){return !!this.entries[key(file)];}
  async replace(next){if(this.storage)await this.storage.update(KEY,next);this.entries=next;}
  async stage(file,value,expectedHash){
    const id=key(file),existing=this.entries[id];
    const base=existing?.base??expectedHash??(fs.existsSync(file)?hash(fs.readFileSync(file)):'');
    const entry={file:path.resolve(file),base,value:JSON.parse(JSON.stringify(value))};
    await this.replace({...this.entries,[id]:entry});
  }
  async discard(files){const next={...this.entries};for(const file of files)delete next[key(file)];await this.replace(next);}
  async save(files){
    const entries=[...new Set(files.map(key))].map(id=>this.entries[id]).filter(Boolean);
    if(!entries.length)return;
    const expectedHashes={};
    for(const entry of entries){
      const current=fs.existsSync(entry.file)?hash(fs.readFileSync(entry.file)):'';
      const desired=JSON.stringify(entry.value,null,2)+'\n';
      // A prior save may have succeeded while clearing local draft storage failed.
      if(current!==entry.base&&current!==hash(desired))throw new Error('Workflow file changed outside this draft: '+entry.file+'. Your draft is retained. Review the file or discard the draft before retrying.');
      expectedHashes[entry.file]=current||hash(Buffer.alloc(0));
    }
    transactionalWriteSet(fs,entries.map(entry=>[entry.file,JSON.stringify(entry.value,null,2)+'\n']),{label:'save-workflow',expectedHashes,backup:false,journal:false});
    await this.discard(entries.map(entry=>entry.file));
  }
}
module.exports={WorkflowDrafts};
