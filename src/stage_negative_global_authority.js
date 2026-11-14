'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
// Exact official artifact/source pair retained in the Stage/Meter QA evidence.
// This is a semantic permission, not a broad nightly/version capability guess.
const REVIEWED=Object.freeze({commit:'6e564af055bb1341b787990f971828ff930935b4',executableSha256:'319e949b19990cde639145842faed96ecf11094fddec95d604aa574b035d9ffc',defaultConfigSha256:'b5ce8f4b2f279ac697e446dc49c46e1747e19f98aaca6a189cfbb1cb0608e235',source:'src/compiler.go',zssLines:[8463,8478],cnsLines:[7269,7272]});
const LATEST_REVIEWED=Object.freeze({...REVIEWED,commit:'fb269c975745d3effc447af4c6d74dd2988fc9ba',executableSha256:'77db97013e9ec1d6b87498de5facdd7a38643ea7522422c0381a13ea8adfa1ca',defaultConfigSha256:'5b913c27e16b5bb077c807e2268942dfe7922849a7044a63a0090503963aab87'});
const REVIEWED_ARTIFACTS=Object.freeze([REVIEWED,LATEST_REVIEWED]);
function reviewedAuthorityFor(binding){return REVIEWED_ARTIFACTS.find(row=>row.commit===binding?.commit&&row.executableSha256===binding?.executableSha256)||null;}
function negativeGlobalAuthority(api,root,filename,catalog){
 const runtime=require('./engine_runtime'),binding=runtime.targetFor(root,filename).target;
 const reviewed=reviewedAuthorityFor(binding);
 if(!reviewed)throw Error('Additive negative-state semantics are not proven for the current engine binding. Use Inspect Engine Binding to bind a supported exact artifact; older or custom engines are not assumed compatible.');
 const executable=runtime.resolve(root,'',filename),actual=crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
 if(actual!==reviewed.executableSha256)throw Error('The bound engine executable changed. Inspect Engine Binding before creating a compatibility hook.');
 if(catalog?.authority?.defaultConfigProvenance?.hash&&catalog.authority.defaultConfigProvenance.hash!==reviewed.defaultConfigSha256)throw Error('The selected defaultConfig.ini is not the matched embedded configuration for this exact engine. Inspect Engine Binding; no source changed.');
 return{...reviewed,buildId:binding.buildId,targetIdentity:JSON.stringify(binding),executable};
}
module.exports={REVIEWED,LATEST_REVIEWED,REVIEWED_ARTIFACTS,reviewedAuthorityFor,negativeGlobalAuthority};
