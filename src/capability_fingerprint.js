'use strict';

const {enabledCapabilityIds}=require('./catalog_capability_filter');

function stableIdentity(value){
  if(Array.isArray(value))return`[${value.map(stableIdentity).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableIdentity(value[key])}`).join(',')}}`;
  return JSON.stringify(value??null);
}
function capabilityFingerprint(capabilities={}){
  const target=capabilities?.target&&typeof capabilities.target==='object'?capabilities.target:{};
  return[String(capabilities?.capabilityFingerprint||''),String(capabilities?.targetBuildId||''),stableIdentity(target),[...enabledCapabilityIds(capabilities)].sort().join(',')].join('|');
}

module.exports={stableIdentity,capabilityFingerprint};
