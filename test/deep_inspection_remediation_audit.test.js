'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),audit=require('../data/deep-inspection-remediation-audit.json');
assert.equal(audit.findings.length,16,'the original audit must retain all 16 findings');
assert.deepEqual(audit.findings.map(item=>item.id),Array.from({length:16},(_,index)=>index+1));
for(const finding of audit.findings){assert.equal(finding.status,'source-verified',`finding ${finding.id} is not source-verified`);assert(finding.evidence.length>=2,`finding ${finding.id} lacks independent evidence`);for(const evidence of finding.evidence)assert(fs.existsSync(path.join(root,evidence)),`finding ${finding.id} evidence is missing: ${evidence}`);}
assert.equal(audit.workspaceSetup.status,'source-verified');for(const evidence of audit.workspaceSetup.evidence)assert(fs.existsSync(path.join(root,evidence)),`Workspace Setup evidence is missing: ${evidence}`);
assert(audit.manualChecksStillRecommended.length>=5);assert(audit.statusMeaning.includes('does not claim live desktop rendering'));
console.log('Original 16-finding remediation audit and Workspace Setup evidence are complete; hands-on claims remain explicitly separated');
