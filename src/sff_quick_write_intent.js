'use strict';
const path=require('path'),{hashCanonical}=require('./sff_capability_report');
function intentCore({build,draft,plan,writerMode}){
  if(!['ikemaker','sprmake2','both'].includes(writerMode))throw Error('Quick Write needs an explicit supported writer.');
  const targetPath=draft?.target?.path,expectedHash=String(draft?.target?.expectedFingerprint||'').toLowerCase();
  if(!targetPath||!path.isAbsolute(targetPath)||!/^[a-f0-9]{64}$/.test(expectedHash))throw Error('Quick Write needs the exact existing target and source fingerprint.');
  if(!Array.isArray(plan?.ready)||!plan.ready.length||plan.conflicts?.length||plan.skipped?.length)throw Error('Resolve every skipped or conflicting Quick Write source before writing.');
  const specificationHash=build?.specification?.specificationHash;
  if(!/^[a-f0-9]{64}$/i.test(specificationHash||'')||path.resolve(build.outputSff)!==path.resolve(targetPath))throw Error('Quick Write package does not match the reviewed target.');
  return{schema:'ikemaker.sff-quick-write-intent',version:1,authorization:'single-explicit-Write-SFF-action',writerMode,target:{path:path.resolve(targetPath),expectedHash},specificationHash,configuration:draft.configuration,sources:draft.sources.map(source=>({id:source.id,path:source.path,byteHash:source.byteHash,provenance:source.provenance||null})),finalRows:plan.ready.map(row=>({sourceId:row.sourceId,group:row.group,number:row.number,axisX:row.axisX,axisY:row.axisY,paletteId:row.paletteId||null,byteHash:row.source.byteHash})),temporaryRecovery:'private-until-verified-completion'};
}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
function createQuickWriteIntent(input){const core=intentCore(input);return freeze(JSON.parse(JSON.stringify({...core,intentHash:hashCanonical(core)})))}
function assertQuickWriteIntent(intent,input){const expected=createQuickWriteIntent({...input,writerMode:input.writerMode||intent?.writerMode});if(!intent||intent.intentHash!==expected.intentHash||hashCanonical(Object.fromEntries(Object.entries(intent).filter(([key])=>key!=='intentHash')))!==intent.intentHash)throw Error('The exact Quick Write source, target, writer or review choices changed. Review the current batch before writing.');return intent}
module.exports={createQuickWriteIntent,assertQuickWriteIntent};
