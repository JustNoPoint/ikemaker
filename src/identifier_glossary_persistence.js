'use strict';
const metadata=require('./identifier_glossary_metadata');
class IdentifierGlossaryPersistence{
  constructor(storage,key,options={}){if(!storage||typeof storage.get!=='function'||typeof storage.update!=='function')throw new Error('Glossary persistence requires workspace storage.');this.storage=storage;this.key=String(key);this.onError=typeof options.onError==='function'?options.onError:async()=>{};this.current=metadata.normalizeStore(storage.get(this.key));this.tail=Promise.resolve();}
  snapshot(){return this.current;}
  mutate(mutator,isCurrent=()=>true){
    if(typeof mutator!=='function')return Promise.reject(new Error('Glossary persistence requires a mutation function.'));
    const operation=this.tail.then(async()=>{if(!isCurrent())return Object.freeze({saved:false,adopted:false,reason:'stale-context',store:this.current});const durable=metadata.normalizeStore(this.storage.get(this.key));let next;try{next=mutator(durable);}catch(error){await this.onError(error);return Object.freeze({saved:false,adopted:false,reason:'validation-failed',store:this.current});}if(!isCurrent())return Object.freeze({saved:false,adopted:false,reason:'stale-context',store:this.current});try{await this.storage.update(this.key,next);}catch(error){await this.onError(error);return Object.freeze({saved:false,adopted:false,reason:'storage-failed',store:this.current});}this.current=next;return Object.freeze({saved:true,adopted:isCurrent(),reason:isCurrent()?'':'context-changed-after-save',store:next});});
    this.tail=operation.then(()=>undefined,()=>undefined);return operation;
  }
}
module.exports={IdentifierGlossaryPersistence};
