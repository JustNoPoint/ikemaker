'use strict';

const path = require('path');
const { parseAir } = require('./air_preview_model');
const { sourceFingerprint } = require('./air_batch_scope');
const { frameRole } = require('./air_clsn2_batch_model');

const POSES = Object.freeze(['stand', 'crouch', 'air', 'down']);
const STORAGE = 'ikemaker.air.pushboxVisibility.v1';

function identity(filename) {
  if (!filename) return '';
  const absolute = path.resolve(filename);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function scopeKey(airPath, ownerDef) {
  return STORAGE + '.' + sourceFingerprint(JSON.stringify([identity(airPath), identity(ownerDef)]));
}

function actionRevisions(text, actions = parseAir(text)) {
  const lines = String(text).split(/\r?\n/), revisions = new Map();
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index], stop = (actions[index + 1]?.line || lines.length + 1) - 1;
    const start = action.line - 1, body = lines.slice(start, stop).join('\n').trimEnd();
    const anchor = body && !action.readOnly && action.frames.length
      ? { revision: sourceFingerprint(body), count: action.frames.length }
      : null;
    revisions.set(action.number, revisions.has(action.number) ? null : anchor);
  }
  return revisions;
}

function suggestedPoses(assignment, frameIndex) {
  const role = frameRole(assignment, frameIndex), pose = role === 'grounded-start' ? 'stand' : role;
  return POSES.includes(pose) ? [pose] : [];
}

function normalizePoses(values) {
  if (!Array.isArray(values) || values.some(value => !POSES.includes(value))) throw new Error('Choose only valid push-box overlay poses.');
  return POSES.filter(pose => values.includes(pose));
}

function poseKey(action, element) {
  return `${action}:${element}`;
}

function projectPreferences(records, revisions) {
  const manual = {}, review = new Set();
  for (const record of records) {
    const current = revisions.get(record.action);
    if (current?.revision === record.revision && record.element <= current.count) {
      manual[poseKey(record.action, record.element)] = record.poses;
    } else if (record.active !== false) review.add(record.action);
  }
  return { manual, review: [...review].sort((a, b) => a - b) };
}

class AirPushboxPreferences {
  constructor(state) {
    this.state = state;
    this.writes = new Map();
  }

  records(airPath, ownerDef) {
    const records = this.state?.get?.(scopeKey(airPath, ownerDef), []);
    return Array.isArray(records) ? records.filter(record =>
      Number.isSafeInteger(record?.action) && Number.isSafeInteger(record.element) && record.element >= 1
      && /^[A-F0-9]{64}$/.test(record.revision) && Array.isArray(record.poses) && record.poses.every(pose => POSES.includes(pose))
    ) : [];
  }

  async write(airPath, ownerDef, transform) {
    if (!this.state?.update) throw new Error('Workspace storage for push-box overlay choices is unavailable.');
    const key = scopeKey(airPath, ownerDef), prior = this.writes.get(key) || Promise.resolve();
    const write = prior.catch(() => undefined).then(async () => {
      const current = this.records(airPath, ownerDef), next = transform(current);
      if (next !== current) await this.state.update(key, next.length ? next : undefined);
      return next;
    });
    this.writes.set(key, write);
    try { return await write; }
    finally { if (this.writes.get(key) === write) this.writes.delete(key); }
  }

  async choose(airPath, ownerDef, action, element, revision, poses) {
    if (!Number.isSafeInteger(action) || !Number.isSafeInteger(element) || element < 1 || !/^[A-F0-9]{64}$/.test(revision)) throw new Error('Select an exact AIR element before remembering push-box visibility.');
    const choice = poses === null ? null : normalizePoses(poses);
    return this.write(airPath, ownerDef, records => {
      const retained = records.flatMap(record => {
        if (record.action !== action || record.element !== element) return [record];
        if (record.revision === revision) return [];
        return [{ ...record, active: false }];
      });
      if (choice !== null) retained.push({ action, element, revision, poses: choice, active: true });
      return retained;
    });
  }

  async rebind(airPath, ownerDef, before, after, mappings) {
    return this.write(airPath, ownerDef, records => {
      const next = records.slice();
      for (const { action, nextAction = action, positions } of mappings) {
        const oldAnchor = before.get(action), newAnchor = after.get(nextAction);
        if (!oldAnchor || !newAnchor || positions.length !== oldAnchor.count) continue;
        const targets = positions.filter(element => element !== null);
        if (new Set(targets).size !== targets.length || targets.some(element => !Number.isSafeInteger(element) || element < 1 || element > newAnchor.count)) continue;
        if (oldAnchor.revision === newAnchor.revision) {
          if (positions.every((element, index) => element === index + 1)) continue;
          for (const record of records) {
            if (record.action !== action || record.revision !== oldAnchor.revision) continue;
            const index = next.indexOf(record), element = positions[record.element - 1];
            if (index !== -1 && element) next[index] = { ...record, element };
          }
          continue;
        }
        for (const record of records) {
          if (record.action !== action || record.revision !== oldAnchor.revision) continue;
          const element = positions[record.element - 1], index = next.indexOf(record);
          if (index !== -1) next[index] = { ...record, active: false };
          if (!element || next.some(item => item.action === nextAction && item.element === element && item.revision === newAnchor.revision)) continue;
          next.push({ ...record, action: nextAction, element, revision: newAnchor.revision, active: true });
        }
      }
      return records.every((item, index) => item === next[index]) && records.length === next.length ? records : next;
    });
  }
}

module.exports = { POSES, scopeKey, actionRevisions, suggestedPoses, poseKey, projectPreferences, AirPushboxPreferences };
