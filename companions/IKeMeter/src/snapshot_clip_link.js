'use strict';

const path = require('node:path');
const {isDeepStrictEqual: equal} = require('node:util');
const {sha} = require('./snapshot_binding');
const {fieldNames} = require('./player_telemetry_wire');
const {readBoundedFile,loadSnapshotReviewEvidence,reviewedEntity} = require('./snapshot_review_evidence');
const {buildSnapshotFinding} = require('./snapshot_finding_export');

function requireProof(condition, message) {
  if (!condition) throw Error(message);
}

// Only accept the compact or indented JSON encodings written by Meter.
// Comparing the full serialization also rejects duplicate keys.
function localFile(filename) {
  const absolute = path.resolve(filename);
  if (/^[\\/]{2}/.test(absolute)) throw Error('Choose a local evidence file');
  return absolute;
}

function readExport(filename) {
  const bytes = readBoundedFile(localFile(filename), 256 * 1024);
  const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const value = JSON.parse(text);
  const body = text.endsWith('\n') ? text.slice(0,-1) : text;
  requireProof(body === JSON.stringify(value) || body === JSON.stringify(value,null,2),'Choose a Meter JSON export');
  return {value,digest:sha(bytes)};
}

function verifyFrozenRoot(clip, view, evidence, entityId) {
  const {verdict,first} = evidence;
  const frame = clip.frames?.[0];
  requireProof(clip.schema === 'ikemeter.player-telemetry' && clip.version === 1 &&
    clip.includeDiagnostics === false && equal(clip.events,[]) && equal(clip.links,[]) && clip.frames.length === 1 &&
    frame?.paused === true && frame.gameTime === verdict.tick && frame.seq >= 1 && Number.isSafeInteger(frame.seq),
    'Select one unlinked paused observation at the verified GameTime');
  requireProof(Number.isSafeInteger(view.firstSeq) && Number.isSafeInteger(view.lastSeq) &&
    view.firstSeq >= 1 && view.firstSeq <= frame.seq && frame.seq <= view.lastSeq &&
    verdict.telemetryFrameSha256 === sha(Buffer.from(JSON.stringify({session:clip.session,frame}))),
    'A matching collector observation digest in the original frozen pair is required');
  requireProof(view.selectionStatus === 'retained' && equal(clip.session,view.session) && equal(frame,view.selected) &&
    clip.session.id === verdict.sessionId && clip.session.epoch === verdict.epoch &&
    clip.session.engineSha256 === first.engine.sha256 && clip.session.phase === 'post-action-ui-loop',
    'The retained observation, clip and frozen Snapshot pair must agree');
  const entity = reviewedEntity(evidence,'player',entityId);
  const matches = frame.roots.filter(row => row.id === entityId || row.slot === entity.owner);
  const root = matches[0];
  requireProof(matches.length === 1 && root.id === entity.runtimeId && root.slot === entity.owner &&
    root.id === entity.sourceRuntimeId && Number.isSafeInteger(root.generation) && root.generation >= 1,
    'The frozen root identity or generation is ambiguous');
  const v = root.values, source = entity.fieldProvenance;
  requireProof(source?.positionVelocity === 'engine-observed-at-hook' && source.anim === 'engine-observed' &&
    source.state === 'engine-observed' && source.resolvedSprite === 'stock-resolved-sprite-at-hook' &&
    entity.animationOwner?.status === 'player-slot' && entity.spriteOwner?.status === 'player-slot' &&
    equal([v.stateNo,v.anim,v.posX,v.posY,v.velX,v.velY,v.animOwnerSlot,v.spriteOwnerSlot,v.spriteGroup,v.spriteImage],
      [entity.state,entity.anim,entity.x,entity.y,entity.vx,entity.vy,entity.animationOwner.reportedSlot,
       entity.spriteOwner.reportedSlot,entity.resolvedSprite.group,entity.resolvedSprite.image]),
    'The paired root observations disagree on state, movement, animation, owners or resolved sprite');
  const required = ['stateNo','anim','posX','posY','velX','velY','animOwnerSlot','spriteOwnerSlot','spriteGroup','spriteImage'];
  requireProof(required.every(key => clip.session.capabilities[key] === 'stock' && Number.isFinite(v[key]) &&
    (root.validMask & (1 << fieldNames.indexOf(key))) !== 0),'The selected root lacks valid stock observations');
  return {frame,root,entity};
}

function associateSnapshotClip({pairFile,clipFile,viewFile,findingsFile}) {
  const clip = readExport(clipFile).value, view = readExport(viewFile).value;
  const input = readExport(findingsFile), report = input.value;
  pairFile = localFile(pairFile);
  const evidence = loadSnapshotReviewEvidence(pairFile);
  requireProof(report.schema === 'ikemeter.findings' && report.version === 1 && report.findings?.length === 1,
    'Choose one snapshot finding exported for this frozen pair');
  const finding = report.findings[0], target = finding.locator?.type;
  requireProof(finding.entity?.kind === 'player' && ['source','air','sprite'].includes(target) &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(finding.id),'The finding lacks a supported bound player locator');
  const {frame,root,entity} = verifyFrozenRoot(clip,view,evidence,finding.entity.id);
  const options = {pairFile,entityKind:'player',entityId:root.id,target,projectId:report.project.id,projectRoot:report.project.root};
  if (target === 'source') {
    options.authoredSource = {path:finding.locator.path,line:finding.locator.range.start.line+1};
    const visual = buildSnapshotFinding(evidence,{...options,target:'sprite'}).findings[0].locator;
    requireProof(entity.inCustomState === false && entity.fieldProvenance.inCustomState === 'stock-inCustomState-at-frozen-hook' &&
      clip.session.capabilities.stateOwnerSlot === 'stock' && (root.validMask & (1 << fieldNames.indexOf('stateOwnerSlot'))) !== 0 &&
      root.values.stateOwnerSlot === root.slot && visual?.type === 'sprite' && equal(visual.ownerDef,finding.locator.ownerDef),
      'Linking authored source requires independent frozen own-state and assigned sprite evidence');
  }
  const rebuilt = buildSnapshotFinding(evidence,options);
  rebuilt.findings[0].id = finding.id;
  requireProof(equal(rebuilt,report),'The finding cannot be reproduced from the paired evidence and current assigned assets');
  const link = {frameSeq:frame.seq,slot:root.slot,entityId:root.id,generation:root.generation,
    findingId:finding.id,findingsSha256:input.digest};
  return {...clip,links:[link]};
}

module.exports = {associateSnapshotClip,verifyFrozenRoot};
