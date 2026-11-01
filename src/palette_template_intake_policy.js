'use strict';

const crypto = require('crypto');

const SCHEMA = 'ikemaker.palette-template-intake-review';
const VERSION = 1;
const MODES = new Set(['derived-palette', 'template-expansion', 'new-template-candidate']);
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function hash(value, label) { const text=String(value||'').toLowerCase();if(!/^[0-9a-f]{64}$/.test(text))throw new Error(`${label} requires an exact SHA-256 hash.`);return text; }
function dimension(value,label){const number=Number(value);if(!Number.isInteger(number)||number<1)throw new Error(`${label} must be a positive integer.`);return number}
function evidence(value,label){if(!value||typeof value!=='object')throw new Error(`${label} evidence is required.`);return{filename:String(value.filename||''),byteHash:hash(value.byteHash,`${label} bytes`),width:dimension(value.width,`${label} width`),height:dimension(value.height,`${label} height`),indexed:value.indexed===true,indexPlaneHash:value.indexed===true?hash(value.indexPlaneHash,`${label} index plane`):'',paletteHash:value.indexed===true?hash(value.paletteHash,`${label} palette`):'',templateId:String(value.templateId||'').slice(0,128)}}
function primary(value){const result=evidence({...value,indexed:true},'Primary template');if(!value?.authorityHash)throw new Error('Primary template authority is required.');result.authorityHash=hash(value.authorityHash,'Primary template authority');result.zoneDocumentHash=value.zoneDocumentHash?hash(value.zoneDocumentHash,'Primary template layout'):'';result.templateId=String(value.templateId||'').slice(0,128);return result}
function normalize(input={}){
  const mode=String(input.mode||'');if(!MODES.has(mode))throw new Error('Choose whether this is a palette made from the current template or a separate new-template candidate.');
  const authority=primary(input.primary),submission=evidence(input.submission,'Submitted image'),sameCanvas=authority.width===submission.width&&authority.height===submission.height,containsPrimaryCanvas=submission.width>=authority.width&&submission.height>=authority.height;
  const route=mode==='derived-palette'?(sameCanvas?'overlay-recovery':'manual-align-or-reject'):mode==='template-expansion'?(containsPrimaryCanvas?'overlay-expansion-review':'manual-align-or-reject'):(submission.indexed?'review-indexed-candidate':'manual-repair-or-reject');
  const allowedActions=mode==='derived-palette'?(sameCanvas?['recover-with-template-overlay','reject']:['manually-align-overlay','reject']):mode==='template-expansion'?(submission.indexed?['review-isolated-expansion','reject']:['repair-manually','reject']):(submission.indexed?['review-isolated-candidate','reject']:['repair-manually','reject']);
  const body={schema:SCHEMA,version:VERSION,mode,primary:authority,submission,sameCanvas,containsPrimaryCanvas,route,allowedActions,combineWithPrimary:false,primaryWritable:false,status:'reviewing',decision:'',notes:String(input.notes||'').slice(0,1000)};
  return{...body,reviewHash:sha(body)};
}
function verifiedReview(value){if(!value||value.schema!==SCHEMA||value.version!==VERSION)throw new Error('Unsupported template intake review.');const body=clone(value);delete body.reviewHash;if(String(value.reviewHash||'')!==sha(body))throw new Error('Template intake review is invalid or changed.');return clone(value)}
function decide(review,expectedHash,decision,details={}){
  const current=verifiedReview(review);if(current.reviewHash!==String(expectedHash||''))throw new Error('Template intake changed before this decision. Review the current images again.');decision=String(decision||'');if(!current.allowedActions.includes(decision))throw new Error('This decision is not available for the selected intake path.');
  if(decision==='recover-with-template-overlay'&&!current.primary.zoneDocumentHash)throw new Error('Automatic overlay recovery requires reviewed primary-template layout metadata. Use manual alignment or reject the submission.');
  const status=decision==='reject'?'rejected':['review-isolated-candidate','review-isolated-expansion'].includes(decision)?'candidate-review':decision==='repair-manually'||decision==='manually-align-overlay'?'manual-repair':'recovery-review';
  const body={...current,status,decision,notes:String(details.notes||current.notes||'').slice(0,1000)};delete body.reviewHash;return{...body,reviewHash:sha(body)};
}
function promotionPlan(review,expectedHash,input={}){
  const current=verifiedReview(review);if(current.reviewHash!==String(expectedHash||''))throw new Error('Template candidate review changed before promotion.');
  if(!['new-template-candidate','template-expansion'].includes(current.mode))throw new Error('A derived palette submission cannot replace the primary template. Start a separate expansion or new-template candidate review.');
  if(!['candidate-review','manual-repair'].includes(current.status)||!['review-isolated-candidate','review-isolated-expansion','repair-manually'].includes(current.decision))throw new Error('Review or repair the isolated template candidate before promotion.');
  if(input.explicitlyApproved!==true)throw new Error('Promoting a new primary template requires explicit final approval.');
  const candidate=evidence(input.candidate,'Verified template candidate');if(!candidate.indexed)throw new Error('Only a verified indexed image can become the primary template.');
  if(!input.zoneDocumentHash)throw new Error('Promotion requires reviewed swatch-layout metadata for the new template.');
  const body={schema:'ikemaker.palette-template-promotion-plan',version:1,reviewHash:current.reviewHash,oldPrimary:clone(current.primary),newPrimary:candidate,newZoneDocumentHash:hash(input.zoneDocumentHash,'New template layout'),archiveOldPrimary:true,combineWithPrimary:false,adoption:current.mode==='template-expansion'?'explicit-reviewed-primary-update':'explicit-reviewed-replacement'};
  return{...body,planHash:sha(body)};
}

module.exports={SCHEMA,VERSION,normalize,verifiedReview,decide,promotionPlan};
