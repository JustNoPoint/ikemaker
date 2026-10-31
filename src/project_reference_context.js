'use strict';

const ACTIONS=Object.freeze(['discover','reveal','complete','insert']);
const LANGUAGES=Object.freeze(['zss','ikemen-cns','lua']);
const CATEGORIES=Object.freeze(['maps','constants','functions','states','commands','air-assets','sff-assets','snd-assets','helpers','explods','projectiles']);
const EVIDENCE=Object.freeze({
  projectDataDiscovery:'authoring-browser.project-data',
  projectDataReveal:'authoring-browser.project-data.exact-source',
  projectNameCompletion:'language-provider.project-name-completion',
  functionCompletion:'language-provider.function-call-completion',
  stateCompletion:'language-provider.state-destination-completion',
  commandCompletion:'language-provider.command-name-completion',
  assetCompletion:'language-provider.assigned-asset-completion',
  resourceCompletion:'language-provider.resource-id-completion'
});
const plain=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const text=(value,max=512)=>String(value||'').slice(0,max);
const unsupported=(category,language)=>language==='lua'?`IKEMEN ${category} references are not generic Lua syntax.`:`${category} reference assistance has no verified ${language} adapter yet.`;
function actionSet(supported={},reasons={}){const evidence={},unsupportedReasons={};for(const action of ACTIONS){const id=typeof supported[action]==='string'?supported[action]:'';evidence[action]=id;unsupportedReasons[action]=id?'':text(reasons[action]||'This reference action is not verified for the selected grammar.');}return{evidence:Object.freeze(evidence),unsupportedReasons:Object.freeze(unsupportedReasons)};}
function full(completion){return actionSet({discover:EVIDENCE.projectDataDiscovery,reveal:EVIDENCE.projectDataReveal,complete:completion,insert:completion});}
function readOnly(reason){return actionSet({discover:EVIDENCE.projectDataDiscovery,reveal:EVIDENCE.projectDataReveal},{complete:reason,insert:reason});}
function completionOnly(completion,reason){return actionSet({complete:completion,insert:completion},{discover:reason,reveal:reason});}
function none(reason){return actionSet({},Object.fromEntries(ACTIONS.map(action=>[action,reason])));}
function row(category,language,contract){const actions=Object.freeze(Object.fromEntries(ACTIONS.map(action=>[action,Boolean(contract.evidence[action])])));return Object.freeze({category,language,actions,evidence:contract.evidence,unsupportedReasons:contract.unsupportedReasons});}

// Each true cell names its concrete existing route. False cells are honest
// review boundaries, not claims that the grammar can never support the feature.
const BASE=Object.freeze([
  row('maps','zss',full(EVIDENCE.projectNameCompletion)),row('maps','ikemen-cns',full(EVIDENCE.projectNameCompletion)),row('maps','lua',none(unsupported('map(...)','lua'))),
  row('constants','zss',full(EVIDENCE.projectNameCompletion)),row('constants','ikemen-cns',full(EVIDENCE.projectNameCompletion)),row('constants','lua',none(unsupported('const(...)','lua'))),
  row('functions','zss',full(EVIDENCE.functionCompletion)),row('functions','ikemen-cns',readOnly('Authored [Function] completion and insertion are ZSS grammar features.')),row('functions','lua',none('Lua functions remain owned by the native Lua language provider.')),
  row('states','zss',full(EVIDENCE.stateCompletion)),row('states','ikemen-cns',full(EVIDENCE.stateCompletion)),row('states','lua',none(unsupported('StateDef transfer','lua'))),
  row('commands','zss',full(EVIDENCE.commandCompletion)),row('commands','ikemen-cns',full(EVIDENCE.commandCompletion)),row('commands','lua',none(unsupported('character command trigger','lua'))),
  row('air-assets','zss',completionOnly(EVIDENCE.assetCompletion,'AIR identities are completed from the assigned archive; asset-reference search/reveal is not part of Project Data.')),row('air-assets','ikemen-cns',none('Legacy AIR-reference assistance has no verified exact-owner adapter yet.')),row('air-assets','lua',none(unsupported('character AIR field','lua'))),
  row('sff-assets','zss',completionOnly(EVIDENCE.assetCompletion,'SFF identities are completed from the assigned archive; asset-reference search/reveal is not part of Project Data.')),row('sff-assets','ikemen-cns',none('Legacy SFF-reference assistance has no verified exact-owner adapter yet.')),row('sff-assets','lua',none(unsupported('character SFF field','lua'))),
  row('snd-assets','zss',completionOnly(EVIDENCE.assetCompletion,'SND identities are completed from the assigned archive; asset-reference search/reveal is not part of Project Data.')),row('snd-assets','ikemen-cns',none('Legacy SND-reference assistance has no verified exact-owner adapter yet.')),row('snd-assets','lua',none(unsupported('character SND field','lua'))),
  row('helpers','zss',full(EVIDENCE.resourceCompletion)),row('helpers','ikemen-cns',full(EVIDENCE.resourceCompletion)),row('helpers','lua',none(unsupported('Helper controller/trigger','lua'))),
  row('explods','zss',full(EVIDENCE.resourceCompletion)),row('explods','ikemen-cns',full(EVIDENCE.resourceCompletion)),row('explods','lua',none(unsupported('Explod controller/trigger','lua'))),
  row('projectiles','zss',full(EVIDENCE.resourceCompletion)),row('projectiles','ikemen-cns',full(EVIDENCE.resourceCompletion)),row('projectiles','lua',none(unsupported('Projectile controller/trigger','lua')))
]);

function enabledSet(capabilities={}){return new Set((capabilities.enabledCapabilities||[]).filter(value=>typeof value==='string').map(value=>value.toLowerCase()).slice(0,256));}
function exactNightlyStrings(capabilities={}){const target=plain(capabilities.target)?capabilities.target:{},channel=String(target.channel||'').toLowerCase();return channel==='nightly'&&enabledSet(capabilities).has('zss.runtime-strings');}
function projectReferenceMatrix(capabilities={}){const nightlyStrings=exactNightlyStrings(capabilities);return Object.freeze(BASE.map(value=>Object.freeze({...value,nightlyStringDetail:nightlyStrings&&['maps','constants','functions'].includes(value.category)&&value.language==='zss'})));}
function referenceCapability(language,category,action,capabilities={}){
  if(!LANGUAGES.includes(language)||!CATEGORIES.includes(category)||!ACTIONS.includes(action))return Object.freeze({supported:false,reason:'Unknown reference language, category, or action.',evidence:''});
  const value=projectReferenceMatrix(capabilities).find(candidate=>candidate.language===language&&candidate.category===category),evidence=value.evidence[action];
  return Object.freeze({supported:Boolean(evidence),reason:evidence?'':value.unsupportedReasons[action],evidence:evidence||'',nightlyStringDetail:value.nightlyStringDetail});
}

module.exports={ACTIONS,LANGUAGES,CATEGORIES,EVIDENCE,projectReferenceMatrix,referenceCapability};
