'use strict';

const crypto = require('crypto');
const path = require('path');

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_DIMENSION = 32768;

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function inspectPng(filename, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > MAX_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Choose one valid PNG template candidate.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),bitDepth=bytes[24],colorType=bytes[25];
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || !Number.isSafeInteger(width * height)) throw new Error('Template candidate dimensions exceed the reviewed safety limit.');
  const mode=colorType===3?'indexed':colorType===2||colorType===6?'truecolor':'unsupported';
  if(mode==='unsupported')throw new Error(`PNG color type ${colorType} is not supported for an image-template candidate.`);
  return { filename:path.resolve(filename),byteHash:sha(bytes),byteLength:bytes.length,width,height,bitDepth,colorType,mode,indexed:mode==='indexed' };
}
function begin(input={}) {
  const source=inspectPng(input.filename,input.bytes),purpose=String(input.purpose||'replacement-template');
  if(!['replacement-template','derived-palette','template-expansion'].includes(purpose))throw new Error('Choose whether this image is a recolored palette submission, an expansion of the current template, or a replacement-template candidate.');
  const primary=input.primary||null,primaryIdentity=primary?{filename:String(primary.filename||''),byteHash:String(primary.byteHash||''),width:Number(primary.width)||0,height:Number(primary.height)||0}:null;
  if(['derived-palette','template-expansion'].includes(purpose)&&!primaryIdentity)throw new Error('A recolored or expanded submission requires the current authoritative project template.');
  const geometryMatches=!primaryIdentity||(source.width===primaryIdentity.width&&source.height===primaryIdentity.height);
  const containsPrimaryCanvas=!primaryIdentity||(source.width>=primaryIdentity.width&&source.height>=primaryIdentity.height);
  const derived=purpose==='derived-palette',expanded=purpose==='template-expansion';
  return {
    schema:'ikemaker.palette-template-intake',version:1,purpose,source,primary:primaryIdentity,
    isolated:!derived,combineWithPrimary:false,primaryMayBeModified:false,
    geometryMatches,containsPrimaryCanvas,status:derived?(geometryMatches?'overlay-review':'manual-overlay-alignment'):expanded?(containsPrimaryCanvas?'expanded-overlay-review':'manual-overlay-alignment'):source.indexed?'indexed-candidate-review':'decision-required',
    allowedDecisions:derived?(geometryMatches?['recover-with-overlay','reject']:['align-overlay-manually','reject']):expanded?(source.indexed?['review-expanded-candidate','reject']:['repair-manually','reject']):source.indexed?['review-candidate','reject']:['repair-manually','reject'],decision:'',
    guidance:derived?'Use the authoritative template layout as an overlay. Recover colors into a new indexed copy; never replace the primary template from this path.':expanded?'Review this expanded copy by overlaying the current template metadata, then verify every added image, color, and swatch. It remains isolated until IKEMaker builds and approves a replacement primary.':source.indexed?'Review this image as an isolated prospective template. It is never combined with the current template.':'This prospective template is not indexed. Reject it or explicitly enter manual repair; it is never combined with the current template.'
  };
}
function decide(intake,decision){
  if(!intake||intake.schema!=='ikemaker.palette-template-intake')throw new Error('Template intake evidence is missing.');
  decision=String(decision||'');if(!(intake.allowedDecisions||[]).includes(decision))throw new Error('Choose one of the reviewed template-intake decisions.');
  const status=decision==='reject'?'rejected':['repair-manually','align-overlay-manually'].includes(decision)?'manual-repair':decision==='recover-with-overlay'?'overlay-recovery':'candidate-review';
  return {...intake,decision,status};
}
function promotionReview(intake,evidence={}){
  if(!intake||!['replacement-template','template-expansion'].includes(intake.purpose)||!intake.isolated||intake.combineWithPrimary!==false)throw new Error('Only an isolated replacement or expansion candidate can become the primary template.');
  const blockers=[];
  if(intake.status==='rejected'||intake.decision==='reject')blockers.push({code:'CANDIDATE_REJECTED',message:'This submitted image was rejected.'});
  if(!intake.source.indexed&&!evidence.repairedIndexed)blockers.push({code:'INDEXING_REQUIRED',message:'Repair and index this true-color image before promotion.'});
  if(!evidence.colorCoverageReviewed)blockers.push({code:'COLOR_COVERAGE_REVIEW_REQUIRED',message:'Review artwork colors and confirm every retained color is represented.'});
  if(!evidence.swatchLayoutReviewed)blockers.push({code:'SWATCH_LAYOUT_REVIEW_REQUIRED',message:'Verify or repair swatch positions, rows, names, and index order.'});
  if(!evidence.canonicalCandidateBuilt)blockers.push({code:'CANONICAL_CANDIDATE_REQUIRED',message:'Build a separate canonical indexed template candidate.'});
  return {ready:blockers.length===0,blockers,action:blockers.length?'continue-review':'promote-after-final-confirmation',preservePriorPrimary:true,combineWithPrimary:false};
}

module.exports={MAX_BYTES,MAX_DIMENSION,inspectPng,begin,decide,promotionReview};
