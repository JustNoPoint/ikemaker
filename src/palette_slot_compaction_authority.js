'use strict';

const crypto = require('crypto');
const path = require('path');

function key(filename) { const resolved=path.resolve(filename);return process.platform==='win32'?resolved.toLowerCase():resolved; }

class PaletteSlotCompactionAuthority {
  constructor(randomBytes = crypto.randomBytes) { this.randomBytes=randomBytes;this.generations=new Map();this.tokens=new Map(); }
  revoke(filename) { const target=key(filename),generation=this.generations.get(target);this.generations.delete(target);for(const[token,item]of this.tokens)if(item.target===target||item.generationId===generation?.generationId)this.tokens.delete(token); }
  begin(filename,payload) { this.revoke(filename);const target=key(filename),generationId=this.randomBytes(24).toString('hex'),generation={generationId,target,payload};this.generations.set(target,generation);return generation; }
  get(filename) { return this.generations.get(key(filename))||null; }
  update(filename,patch) { const generation=this.get(filename);if(!generation)throw new Error('Palette-number compaction authority expired. Preview again.');generation.payload={...generation.payload,...patch};return generation; }
  issue(filename,stage,expectedRevision) { const generation=this.get(filename);if(!generation)throw new Error('Palette-number compaction authority expired. Preview again.');const token=this.randomBytes(32).toString('hex');this.tokens.set(token,{target:generation.target,generationId:generation.generationId,stage:String(stage),expectedRevision:Number(expectedRevision)});return token; }
  consume(filename,stage,revision,token) { const supplied=String(token||''),item=this.tokens.get(supplied);this.tokens.delete(supplied);const generation=this.get(filename);if(!item||!generation||item.target!==generation.target||item.generationId!==generation.generationId||item.stage!==String(stage)||item.expectedRevision!==Number(revision))throw new Error('This palette-number action expired or was already used. Preview the current mapping again.');return generation; }
}

module.exports = { PaletteSlotCompactionAuthority };
