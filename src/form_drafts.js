'use strict';
// Local extension state only. Drafts never write character files.
const KEY='ikemaker.formDrafts.v1';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
class FormDrafts {
  constructor(storage,key=KEY){this.storage=storage;this.key=key;this.entries=clone(storage?.get(key,{}))||{};this.writing=Promise.resolve();}
  read(key){return clone(this.entries[key]);}
  stage(key,value){this.entries={...this.entries,[key]:clone(value)};return this.flush();}
  discard(key,expected){if(expected!==undefined&&JSON.stringify(this.entries[key])!==JSON.stringify(expected))return Promise.resolve(false);const next={...this.entries};delete next[key];this.entries=next;return this.flush().then(()=>true);}
  flush(){const snapshot=clone(this.entries);this.writing=this.writing.catch(()=>{}).then(()=>this.storage?.update(this.key,snapshot));return this.writing;}
}
module.exports={FormDrafts};
