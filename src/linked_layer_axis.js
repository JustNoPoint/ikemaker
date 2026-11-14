'use strict';

// Resolve exact physical sprite headers before applying one shared axis delta.
// A missing or ambiguous partner is reported, never guessed from archive order.
function linkedAxisTargets(sprites, baseIndices, composition) {
  const byIdentity = new Map();
  for (const sprite of sprites) {
    const key = `${sprite.group},${sprite.number}`;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(sprite.index);
  }
  const layers=(composition?.layers||[]).filter(layer=>layer.id!=='base'&&layer.enabled&&layer.axisLink===true);
  const banks=[...new Set(layers.filter(layer=>layer.source?.kind==='bank').map(layer=>layer.source.bank))];
  const indices = new Set(baseIndices), missing = [], ambiguous = [], resolved=[];
  for (const index of baseIndices) {
    const base = sprites[index];
    if (!base) throw new Error(`Sprite at physical position ${index} is missing.`);
    const from=`${base.group},${base.number}`;
    for (const layer of layers) {
      const mapped=Object.hasOwn(layer.axisMapping||{},from),explicit=layer.axisMapping?.[from];
      if(mapped && explicit===null)continue;
      const bank=layer.source?.kind==='bank'?layer.source.bank:null;
      const group=bank!==null?base.group+bank*10000:null;
      const key=mapped?explicit:(Number.isInteger(bank)&&bank>=1&&bank<=6&&group<=65535?`${group},${base.number}`:null);
      if(!key)continue;
      const matches=byIdentity.get(key)||[];
      if (matches.length === 1) {indices.add(matches[0]);resolved.push({layer:layer.id,from,to:key,index:matches[0],manual:mapped});}
      else (matches.length ? ambiguous : missing).push(`${layer.id}: ${from} → ${key}`);
    }
  }
  return { indices: [...indices].sort((a,b) => a-b), added: indices.size - new Set(baseIndices).size, banks, layers:layers.map(item=>item.id),resolved,missing: [...new Set(missing)], ambiguous: [...new Set(ambiguous)] };
}

module.exports = { linkedAxisTargets };
