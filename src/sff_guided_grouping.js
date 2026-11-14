'use strict';
function applyGuidedGrouping(configuration, additions, settings = {}) {
  if (settings.separatePsdGroups !== true) return;
  const layers=additions.filter(row=>row.provenance?.layerRole);
  if(!layers.length)return;
  const cosmeticGroup=Number(settings.cosmeticGroup),bodyGroup=Number(configuration.group),start=Number(configuration.startIndex),step=configuration.numberingMode==='stepped'?10:1;
  if ([configuration.group,configuration.startIndex].some(value=>String(value??'').trim()==='')||![bodyGroup,start].every(value=>Number.isInteger(value)&&value>=0&&value<=65535))throw Error('Choose whole-number body group and starting index from 0 to 65535.');
  if(String(settings.cosmeticGroup??'').trim()===''||!Number.isInteger(cosmeticGroup)||cosmeticGroup<0||cosmeticGroup>65535||cosmeticGroup===bodyGroup)throw Error('Choose distinct explicit body and cosmetic groups from 0 to 65535.');
  const assigned=new Set(),overrides={...configuration.overrides};
  for(const row of layers){
    if(!['body','cosmetic'].includes(row.provenance.layerRole))throw Error('Unknown PSD layer role; review per-page assignments in Advanced.');
    const ordinal=row.provenance.sequenceOrdinal,number=start+ordinal*step,group=row.provenance.layerRole==='body'?bodyGroup:cosmeticGroup;
    if(!Number.isInteger(ordinal)||ordinal<0||!Number.isInteger(number)||number<0||number>65535)throw Error('The PSD sequence cannot fit the reviewed index range.');
    const identity=`${group},${number}`;
    if(assigned.has(identity))throw Error('Multiple selected cosmetic pages share a body frame. Choose one cosmetic page per document or use Advanced per-page assignments.');
    assigned.add(identity);overrides[row.id]={...(overrides[row.id]||{}),group,number};
  }
  configuration.overrides=overrides;
  configuration.guidedPsdGrouping={bodyGroup,cosmeticGroup,policy:'first-authored-page-body; other-selected-page-cosmetic; shared-document-index; absent-cosmetics-remain-gaps'};
}
function assertGuidedPairing(plan, configuration) {
  if(!configuration.guidedPsdGrouping)return;
  const byDocument=new Map();
  for(const row of plan.ready||[]){
    const proof=row.source?.provenance;if(!proof?.layerRole)continue;
    const key=JSON.stringify([proof.originalPath||proof.sourceFile,proof.originalHash||proof.sourceByteHash,proof.sequenceOrdinal]);
    if(!byDocument.has(key))byDocument.set(key,[]);byDocument.get(key).push(row);
  }
  for(const rows of byDocument.values()){
    const body=rows.filter(row=>row.source.provenance.layerRole==='body'),cosmetics=rows.filter(row=>row.source.provenance.layerRole==='cosmetic');
    if(cosmetics.length&&(body.length!==1||cosmetics.length!==1||cosmetics[0].number!==body[0].number))throw Error('Collision handling changed the matching PSD body/cosmetic indexes. Choose free groups or review per-page assignments in Advanced.');
  }
}
module.exports={applyGuidedGrouping,assertGuidedPairing};
