'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {reviewedEntity} = require('./snapshot_review_evidence');
const {boundSnapshotLocator}=require('./snapshot_binding_locator');
const localRoot = /^(?:[A-Za-z]:[\\/]|\/(?![\\/]))/;

function requiredText(value, max, label) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(clean)) {
    throw Error(`${label} must be plain text of up to ${max} characters`);
  }
  return clean;
}

function projectIdentity(id, directory) {
  const root = requiredText(directory, 1024, 'Project root');
  if (!localRoot.test(root) || !path.isAbsolute(root)) {
    throw Error('Supply the Maker project root as an absolute local folder');
  }
  if (!fs.statSync(root).isDirectory()) throw Error('The Maker project root must be a folder');
  const canonical = fs.realpathSync(root);
  if (!localRoot.test(canonical)) throw Error('The Maker project root must resolve to a local folder');
  return {id:requiredText(id, 160, 'Project ID'),root:requiredText(canonical, 1024, 'Resolved project root')};
}

function validSprite(value) {
  return value && [value.group,value.image].every(Number.isSafeInteger);
}

function spriteDifference(entity) {
  const {authoredAirFrame:air,resolvedSprite:resolved,fieldProvenance:source} = entity;
  const authored = air?.sprite;
  if (source?.authoredAirFrame !== 'stock-saved-air-frame-at-hook' ||
      source?.resolvedSprite !== 'stock-resolved-sprite-at-hook' ||
      ![authored,resolved].every(sprite => validSprite(sprite) &&
        [sprite.group,sprite.image].every(value => value >= 0 && value <= 65535)) ||
      authored.group === resolved.group && authored.image === resolved.image) return null;
  return `Authored AIR sprite (${authored.group}, ${authored.image}) differs from resolved sprite (${resolved.group}, ${resolved.image}) at the captured tick.`;
}

function reviewEvidence({verdict,first,second}, entity) {
  const {anim,authoredAirFrame:air,resolvedSprite:sprite,airTimingEstimate:timing,fieldProvenance:source} = entity;
  const details = [];
  if (Number.isSafeInteger(anim) && source?.anim === 'engine-observed') details.push(`action ${anim}`);
  if (source?.authoredAirFrame === 'stock-saved-air-frame-at-hook') {
    if (validSprite(air?.sprite)) details.push(`authored AIR sprite ${air.sprite.group},${air.sprite.image}`);
    if (Number.isSafeInteger(air?.durationTicks)) details.push(`authored duration ${air.durationTicks}`);
  }
  if (validSprite(sprite) && source?.resolvedSprite === 'stock-resolved-sprite-at-hook') {
    details.push(`resolved sprite ${sprite.group},${sprite.image}`);
  }
  if (timing && [timing.element,timing.elapsedTicks].every(Number.isSafeInteger) &&
      source?.airTimingEstimate === 'derived-from-stock-animation-triggers') {
    details.push(`timing estimate element ${timing.element}, elapsed ${timing.elapsedTicks}`);
  }
  const observations = details.length ? ` Hook observations include ${details.join(' · ')}.` : '';
  return `Review the symptom. Source location and cause are unavailable. Snapshot pair ${verdict.id}, captures ${first.id} and ${second.id}. Engine SHA-256 ${first.engine.sha256}.${observations}`;
}

function buildSnapshotFinding(evidence, options) {
  const project = projectIdentity(options.projectId, options.projectRoot);
  const entity = reviewedEntity(evidence, options.entityKind, options.entityId);
  const automatic = options.message === undefined;
  if(options.target!==undefined&&!['air','sprite','source'].includes(options.target))throw Error('Choose air, sprite or an explicit authored CNS destination');
  const locator=automatic&&options.target ? boundSnapshotLocator(evidence,options.pairFile,project,entity,options.target,options.authoredSource) : null;
  if (options.target === 'source') {
    if (!locator || !automatic || options.severity !== undefined) {
      throw Error('The selected authored CNS destination could not be bound to the frozen root and its unique DEF assignment');
    }
    return {schema:'ikemeter.findings',version:1,project,findings:[{
      id:randomUUID(),sessionId:evidence.verdict.sessionId,epoch:evidence.verdict.epoch,tick:evidence.verdict.tick,
      clock:'gameTime',entity:{kind:'player',id:entity.runtimeId},kind:'authored-source-reference',
      message:'The selected CNS line defines a literal RemapSprite destination in the state file assigned to the captured root.',
      confidence:'confirmed',attribution:'exact',severity:'info',actions:['navigate','review'],locator,
      resolution:`Review the author-selected destination. Runtime controller execution and symptom cause are unknown. Snapshot pair ${evidence.verdict.id}.`
    }]};
  }
  const observedTarget=options.target==='air'&&Number.isSafeInteger(entity.anim)&&entity.anim>=0&&
    entity.fieldProvenance?.anim==='engine-observed'?`Observed AIR action ${entity.anim} at the captured tick.`:
    options.target==='sprite'&&validSprite(entity.resolvedSprite)&&entity.fieldProvenance?.resolvedSprite==='stock-resolved-sprite-at-hook'?
    `Observed resolved sprite (${entity.resolvedSprite.group}, ${entity.resolvedSprite.image}) at the captured tick.`:null;
  const message = automatic ? spriteDifference(entity)||observedTarget :
    requiredText(options.message, 500, 'Observed symptom');
  if (!message) throw Error('This entity has no supported sprite difference. Use --message to add your own observation.');
  const severity = automatic ? 'info' : options.severity ?? 'info';
  if (automatic && options.severity !== undefined && options.severity !== 'info') {
    throw Error('An automatic sprite observation is informational. Use --message for a user-reported severity.');
  }
  if (!['info','warning','error'].includes(severity)) throw Error('Choose info, warning or error severity');
  // Snapshot uses the bridge's gameTime() read. Stock metadata cannot establish the authoring location.
  return {
    schema:'ikemeter.findings',version:1,project,findings:[{
      id:randomUUID(),sessionId:evidence.verdict.sessionId,tick:evidence.verdict.tick,clock:'gameTime',epoch:evidence.verdict.epoch,
      entity:{id:options.entityId,kind:options.entityKind},kind:'snapshot-observation',severity,message,
      confidence:automatic ? 'confirmed' : 'unknown',attribution:locator?'exact':'unknown',
      resolution:requiredText(locator?
        `Review the bound ${locator.type==='air'?'AIR action':'SFF sprite'} at the observed location. Controller execution and cause remain untraced. Snapshot pair ${evidence.verdict.id}. Engine SHA-256 ${evidence.first.engine.sha256}.` :
        reviewEvidence(evidence,entity),500,'Review evidence'),
      actions:locator?['navigate','review']:['review'],...(locator&&{locator})
    }]
  };
}

module.exports = {buildSnapshotFinding};
