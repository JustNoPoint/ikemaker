'use strict';
const path=require('node:path'),{hash}=require('./mutation_safety'),{canonical}=require('./stage_source_representation'),{REVIEWED,LATEST_REVIEWED}=require('./stage_negative_global_authority');
const PROFILE='stock-common-6e',LATEST_PROFILE='stock-common-fb269c9';
const PROFILES=Object.freeze({[PROFILE]:REVIEWED,[LATEST_PROFILE]:LATEST_REVIEWED});
// Exact reviewed source CONTENTS, not filenames. Canonicalization is the existing
// BOM/EOL representation rule; source snapshots still guard original bytes.
const MODULES=Object.freeze({
 demo:'e2d3f2840c5014f22714b4d06f0206edfc44f5c046aef1254e0ded252c2d6d5e',
 system:'50c1264c0cf5f4e0fb86860b5fef9c3e60c614de0004e7cdc701557d294d56a5',
 tag:'4fd31fe4e5bdb3a6a2d3b4d3dd5b7173abd5ef58f1bfc2fc4704098358039104',
 dizzy:'94b43f95176e07c1daf932055903c6f6560d75c6e99d1d80473efcdc0842d82d'
});
const TAG_STATES=['StateTagEnteringScreen','StateTagLeavingScreen','StateTagWaitingOutside','StateTagJumpingIn','StateTagLanding','StateDizzyBirdsHelper'];
const key=f=>path.resolve(f).toLowerCase();
function moduleKind(source){const digest=hash(canonical(source.text));return Object.keys(MODULES).find(name=>MODULES[name]===digest)||null;}
function lateCondition(text){
 text=require('./stage_reaction_plan').expression(text||'1');let at=0,tokens=0;
 // Unitless, read-only operands preserve meaning across owner/actor localcoords.
 // Reject all unknown tokens instead of guessing whether a function has effects.
 const token=/^(?:\s+|map\s*\(\s*"[^"\\\r\n]+"\s*\)|(?:lifeMax|life|ctrl|time|stateNo|animTime|anim)\b|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|&&|\|\||>=|<=|!=|[=<>+*/%()!\-])/i;
 while(at<text.length){const remaining=text.slice(at),match=token.exec(remaining);if(!match||/^(?:\+\+|--|[+*/%\-]=)/.test(remaining))throw Error('Verified stock hooks need a unitless read-only readiness condition: literals, map("name"), life/lifeMax, ctrl, time, stateNo or anim/animTime. Random, assignments, redirects, spatial triggers and custom functions require explicit source composition.');if(/^(?:\d|\.)/.test(match[0])&&/[eE]/.test(match[0])&&!match[0].includes('.'))throw Error('Scientific readiness literals need a decimal point for the native compiler (for example 1.e2).');at+=match[0].length;if(++tokens>1024)throw Error('Readiness condition is too complex for verified stock-hook composition.');}
 return text;
}
function redirectLateCondition(text,slot){
 text=lateCondition(text);if(!Number.isSafeInteger(slot)||slot<1||slot>8)throw Error('Invalid participant slot for late readiness.');
 // The native compiler redirects a trigger operand, not a parenthesized expression.
 // Only the previously validated, unitless read-only operands are rewritten.
 return text.replace(/map\s*\(\s*"[^"\\\r\n]+"\s*\)|\b(?:lifeMax|life|ctrl|time|stateNo|animTime|anim)\b/gi,operand=>'(player('+slot+'),'+operand+')');
}
function guardStates(contract){
 const constants=require('./stage_transition_constants').values(contract);
 if(constants?.unresolvedReason)throw Error(constants.unresolvedReason);
 return TAG_STATES.map(name=>{const row=constants?.get(name.toLowerCase());if(!row||!Number.isInteger(row.value)||row.value<0)throw Error('Cannot prove nonnegative integer guard constant '+name+' for '+contract.defFilename+'. Resolve its effective Common.Const / character CNS value before composing hooks.');return{name,value:row.value,filename:row.filename,expression:row.expression};});
}
function inspectContract(contract){
 require('./stage_transition_constants').headers(contract);
 const assignments=contract.runtimeCatalog?.compileAssignments;if(contract.runtimeCatalog?.complete!==true||!Array.isArray(assignments))throw Error('Verified stock hooks require the complete effective source compile-order receipt. Prove engine sources first.');
 const selected=assignments.filter(row=>key(row.filename)===key(contract.sourceFilename));if(selected.length!==1)throw Error('The writable adapter must occur exactly once in the runtime compile list.');
 const physical=new Set();for(const row of assignments){if(typeof row.physicalKey!=='string'||!row.physicalKey)throw Error('Runtime compile assignments lack physical source identity. Prove engine sources again.');if(physical.has(row.physicalKey))throw Error('One physical source is compiled more than once; review that source assignment before composing hooks.');physical.add(row.physicalKey);}
 const selectedIndex=assignments.indexOf(selected[0]),modules=[];
 for(const source of contract.sources){const kind=moduleKind(source);if(!kind)continue;const matches=assignments.filter(row=>key(row.filename)===key(source.filename));if(!/\.zss$/i.test(source.filename)||matches.length!==1||!/^config:states\d*$/i.test(matches[0].role)||assignments.indexOf(matches[0])<=selectedIndex)throw Error('A reviewed stock hook is not in the proven later Common.States ZSS compile order: '+source.filename);modules.push({kind,filename:source.filename,canonicalSha256:MODULES[kind],sha256:hash(source.text),compileIndex:assignments.indexOf(matches[0])});}
 for(const kind of Object.keys(MODULES))if(modules.filter(row=>row.kind===kind).length!==1)throw Error('Verified stock-hook composition requires exactly one unchanged '+kind+' module in effective Common.States. Custom or edited post-state code requires source composition.');
 return modules;
}
function prepare(input){
 const selected=input.commonProfile||'strict';if(selected!=='strict'&&!Object.hasOwn(PROFILES,selected))throw Error('Choose a supported common-hook composition profile.');if(selected==='strict')return null;
 const reviewed=PROFILES[selected],engine=input.commonProfileEvidence;if(engine?.commit!==reviewed.commit||engine?.executableSha256!==reviewed.executableSha256||typeof engine.buildId!=='string'||!engine.buildId)throw Error('Verified stock hooks require the exact reviewed official '+reviewed.commit.slice(0,7)+' executable binding.');
 if(input.otherOwnerSources?.length)throw Error('Verified stock hooks support exactly one attached coordinator. Multiple attached-owner graphs require explicit source composition.');
 if(input.entityPolicy!=='wait-clear')throw Error('Verified stock hooks require the explicit Wait until selected fighters own none helper/projectile policy. Nothing is destroyed or silently moved.');
 if(typeof input.runtimeRoot!=='string'||!path.isAbsolute(input.runtimeRoot))throw Error('Verified stock hooks need the exact Stage runtime root. Prove engine sources first.');
 for(const actor of[input.owner,...input.participants])if(!actor.runtimeCatalog?.root||key(actor.runtimeCatalog.root)!==key(input.runtimeRoot)||actor.runtimeCatalog.defaultConfigProvenance?.hash!==reviewed.defaultConfigSha256)throw Error('Mixed or unresolved runtime/config authority for '+actor.defFilename+'. Select sources proven against this Stage runtime and matched defaults; outside-project character defaults cannot authorize this transition.');
 const actors=[input.owner,...input.participants],contracts=actors.map(contract=>({defFilename:contract.defFilename,sourceFilename:contract.sourceFilename,slots:contract.slots||[],guardStates:guardStates(contract),modules:inspectContract(contract),headers:require('./stage_transition_constants').headers(contract),compileOrder:contract.runtimeCatalog.compileAssignments.map(row=>({...row})),constantSources:[...(contract.runtimeCatalog.constants?.commonInputs||[]),...(contract.runtimeCatalog.constants?.characterCns?[contract.runtimeCatalog.constants.characterCns]:[])].map(row=>({filename:row.filename,sha256:hash(row.text)})),defaultConfigProvenance:contract.runtimeCatalog.defaultConfigProvenance||null})),known=new Map();for(const actor of contracts)for(const source of actor.modules)known.set(key(source.filename),source);
 return {profile:selected,engine:{commit:engine.commit,executableSha256:engine.executableSha256,buildId:engine.buildId,targetIdentity:engine.targetIdentity||null},contracts,inputs:[...known.values()],known};
}
function recognized(source,profile){const row=profile?.known.get(key(source.filename));return Boolean(row&&hash(source.text)===row.sha256&&moduleKind(source)===row.kind);}
function stateChecks(prefix,contract){return TAG_STATES.map(name=>{const value=contract?.guardStates.find(row=>row.name===name)?.value,operand=value===undefined?'const('+name+')':String(value);return prefix?'('+prefix+'stateNo) != '+operand:'stateNo != '+operand;}).join(' && ');}
function actorGuard(slot,profile){const p='player('+slot+'),',contract=profile?.contracts.slice(1).find(row=>row.slots.includes(slot));if(profile&&!contract)throw Error('Missing exact participant guard constants for slot '+slot);return '('+p+'teamMode != Tag) && ('+p+'map("_iksys_tagActive")) = 0 && '+stateChecks(p,contract);}
function modeGuard(slots,profile){return 'gameMode != "demo" && teamMode != Tag && map("_iksys_tagActive") = 0 && '+stateChecks('',profile?.contracts[0])+' && '+slots.map(slot=>actorGuard(slot,profile)).join(' && ');}
function liveGuard(slots,profile){return modeGuard(slots,profile)+' && numHelper = 0 && numProj = 0';}
function receipt(profile){if(!profile)return null;const {known,...result}=profile;return result;}
module.exports={PROFILE,LATEST_PROFILE,PROFILES,redirectLateCondition,guardStates,MODULES,TAG_STATES,moduleKind,lateCondition,prepare,recognized,modeGuard,liveGuard,receipt};
