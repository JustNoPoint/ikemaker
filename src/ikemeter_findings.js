'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');

const COMMAND = 'ikemen.importIKeMeterFindings';
const REOPEN_COMMAND = 'ikemen.reopenIKeMeterFindings';
const SCHEMA = 'ikemeter.findings';
const MAX_IMPORT = 1024 * 1024;
const MAX_TEXT = 4 * 1024 * 1024;
const MAX_SFF = 128 * 1024 * 1024;
const CONFIDENCE = ['confirmed', 'inferred', 'unknown'];
const SEVERITY = ['info', 'warning', 'error'];
const ACTIONS = ['navigate', 'review'];
const ATTRIBUTION = ['exact', 'ambiguous', 'unknown'];
const CLOCKS = ['gameTime', 'sample'];

function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fields(value, names, message) {
  requireValue(record(value) && Object.keys(value).every(key => names.includes(key)), message);
}

function parseJson(input) {
  const value = JSON.parse(input);
  // JSON.parse validates syntax. Scan its tokens to detect repeated member names
  // before consuming an object whose interpretation might differ across readers.
  const stack = [];
  for (const match of input.matchAll(/"(?:[^"\\]|\\.)*"\s*:?|[{}\[\]]/g)) {
    const token = match[0];
    if (token === '{' || token === '[') stack.push(token === '{' ? new Set() : null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.endsWith(':')) {
      const name = JSON.parse(token.slice(0, -1));
      const names = stack.at(-1);
      requireValue(!names.has(name), 'The findings JSON repeats a field name.');
      names.add(name);
    }
  }
  return value;
}

function text(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
    !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
}

function integer(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function relativePath(value) {
  requireValue(text(value, 1024), 'The project-relative path is invalid.');
  const segments = value.normalize('NFC').split('/');
  requireValue(segments.every(segment => segment && segment !== '.' && segment !== '..' &&
    !/[\\:<>"|?*]/.test(segment) && !/[. ]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?: *\.|$)/i.test(segment)),
  'Use a project-relative file path with forward slashes.');
  return segments.join('/');
}

function fingerprint(value) {
  requireValue(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'The file needs a lowercase SHA-256 fingerprint.');
  return value;
}

function position(value) {
  fields(value, ['line', 'character'], 'The source position is invalid.');
  requireValue(integer(value.line) && integer(value.character), 'The source position is invalid.');
  return { line: value.line, character: value.character };
}

function parseLocator(value) {
  requireValue(record(value), 'The locator is invalid.');
  const shared = ['type', 'path', 'sha256', 'ownerDef'];
  const specific = { source: ['range'], air: ['action', 'element', 'authoredFrame'], sprite: ['group', 'image', 'physicalIndex'] };
  requireValue(typeof value.type === 'string' && Object.hasOwn(specific, value.type), 'The locator type is unsupported.');
  fields(value, [...shared, ...specific[value.type]], 'The locator contains an unsupported field.');
  const locator = { type: value.type, path: relativePath(value.path), sha256: fingerprint(value.sha256) };
  if (value.ownerDef !== undefined) {
    fields(value.ownerDef, ['path', 'sha256', 'player'], 'The owner DEF evidence is invalid.');
    requireValue(integer(value.ownerDef.player, 1), 'The owner DEF needs an observed player number.');
    locator.ownerDef = { path: relativePath(value.ownerDef.path), sha256: fingerprint(value.ownerDef.sha256), player: value.ownerDef.player };
  }
  switch (locator.type) {
    case 'source': {
      fields(value.range, ['start', 'end'], 'The source locator needs a range.');
      const start = position(value.range.start), end = position(value.range.end);
      requireValue(start.line < end.line || start.line === end.line && start.character <= end.character,
        'The source range ends before it starts.');
      return { ...locator, range: { start, end } };
    }
    case 'air':
      requireValue(integer(value.action) &&
        (value.element === undefined || integer(value.element, 1)), 'The AIR action or element is invalid.');
      let authoredFrame;
      if (value.authoredFrame !== undefined) {
        const frame = value.authoredFrame;
        fields(frame, ['group', 'image', 'duration'], 'The authored AIR frame evidence is invalid.');
        requireValue(Number.isSafeInteger(frame.group) && Number.isSafeInteger(frame.image) &&
          Number.isSafeInteger(frame.duration), 'The authored AIR frame evidence is invalid.');
        authoredFrame = { group: frame.group, image: frame.image, duration: frame.duration };
      }
      return { ...locator, action: value.action, element: value.element, authoredFrame };
    case 'sprite':
      requireValue(integer(value.group) && value.group <= 65535 &&
        integer(value.image) && value.image <= 65535 &&
        (value.physicalIndex === undefined || integer(value.physicalIndex)), 'The SFF sprite coordinates are invalid.');
      return { ...locator, group: value.group, image: value.image, physicalIndex: value.physicalIndex };
    default:
      throw new Error('The locator type is unsupported.');
  }
}

function parseFindings(value) {
  fields(value, ['schema', 'version', 'project', 'findings'], 'The findings envelope contains an unsupported field.');
  requireValue(value.schema === SCHEMA && value.version === 1, 'This IKeMeter findings format or version is unsupported.');
  const project = value.project;
  fields(project, ['id', 'root'], 'The capture project contains an unsupported field.');
  requireValue(text(project.id, 160) && text(project.root, 1024) &&
    /^(?:[A-Za-z]:[\\/]|\/(?![\\/]))/.test(project.root), 'The capture needs a project ID and absolute local root.');
  requireValue(Array.isArray(value.findings) && value.findings.length <= 500, 'A findings file can contain up to 500 entries.');
  const ids = new Set();
  const findings = value.findings.map(item => {
    fields(item, ['id', 'sessionId', 'tick', 'clock', 'epoch', 'continuityRevision', 'entity', 'kind',
      'message', 'severity', 'confidence', 'attribution', 'resolution', 'actions', 'locator'],
    'A finding contains an unsupported field.');
    requireValue(text(item.id, 160) && !ids.has(item.id), 'Each finding needs a unique ID.');
    ids.add(item.id);
    fields(item.entity, ['id', 'kind'], 'A finding has invalid entity evidence.');
    requireValue(text(item.sessionId, 160) && integer(item.tick) && CLOCKS.includes(item.clock) &&
      (text(item.entity.id, 160) || integer(item.entity.id)) && text(item.entity.kind, 80) &&
      (item.epoch === undefined || integer(item.epoch, 1)) &&
      (item.continuityRevision === undefined || integer(item.continuityRevision)), 'A finding has invalid runtime evidence.');
    requireValue(text(item.kind, 80) && text(item.message, 500) && CONFIDENCE.includes(item.confidence) &&
      SEVERITY.includes(item.severity) && ATTRIBUTION.includes(item.attribution), 'A finding has an invalid kind, severity, confidence or message.');
    requireValue(item.resolution === undefined || text(item.resolution, 500), 'The proposed resolution must be plain text.');
    requireValue(Array.isArray(item.actions) && item.actions.length <= ACTIONS.length &&
      new Set(item.actions).size === item.actions.length && item.actions.every(action => ACTIONS.includes(action)),
    'A finding requests an unsupported action.');
    const locator = item.locator === undefined ? undefined : parseLocator(item.locator);
    requireValue(!item.actions.includes('navigate') || locator, 'Navigation requires a file locator.');
    return {
      id: item.id, sessionId: item.sessionId, tick: item.tick, clock: item.clock, epoch: item.epoch,
      continuityRevision: item.continuityRevision, entity: { id: item.entity.id, kind: item.entity.kind },
      kind: item.kind, message: item.message, severity: item.severity, confidence: item.confidence, attribution: item.attribution,
      resolution: item.resolution, actions: [...item.actions], locator
    };
  });
  return { schema: SCHEMA, version: 1, project: { id: project.id, root: project.root }, findings };
}

function readBounded(filename, max) {
  requireValue(fs.statSync(filename).isFile(), 'Choose an ordinary file.');
  const descriptor = fs.openSync(filename, 'r');
  try {
    const before = fs.fstatSync(descriptor);
    requireValue(before.isFile() && before.size <= max, 'The file exceeds the supported size or is unavailable.');
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset);
      requireValue(count > 0, 'The file changed during inspection.');
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    requireValue(before.size === after.size && before.mtimeMs === after.mtimeMs, 'The file changed during inspection.');
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function decode(bytes) {
  let result;
  try { result = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Exact navigation currently supports UTF-8 source and owner files only. Review this finding without navigation; no encoding conversion was performed.'); }
  requireValue(!result.includes('\0'), 'Only UTF-8 text is supported for exact source navigation.');
  return result;
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function canonicalTarget(root, resource) {
  let requested = root;
  for (const segment of relativePath(resource).split('/')) {
    requested = path.join(requested, segment);
    requireValue(!fs.lstatSync(requested).isSymbolicLink(), 'Linked project locations cannot be verified.');
  }
  const canonical = fs.realpathSync.native(requested);
  requireValue(within(root, canonical) && fs.statSync(canonical).isFile(),
    'The target leaves the mapped project root or is not an ordinary file.');
  return canonical;
}

function dirty(vscode, filename) {
  return (vscode.workspace.textDocuments || []).some(doc => {
    if (doc.uri?.scheme !== 'file' || !doc.isDirty || doc.isClosed) return false;
    const candidate = doc.uri.fsPath;
    if (path.relative(candidate, filename) === '') return true;
    try {
      return path.relative(fs.realpathSync.native(candidate), filename) === '';
    } catch {
      return false;
    }
  });
}

function fileStamp(filename) {
  const { dev, ino, size, ctimeNs, mtimeNs } = fs.statSync(filename, { bigint: true });
  return [dev, ino, size, ctimeNs, mtimeNs].join(':');
}

function verifiedFile(vscode, root, resource, max, expectedStamp) {
  const filename = canonicalTarget(root, resource.path);
  requireValue(!dirty(vscode, filename), 'Save or revert the unsaved source changes before verifying this finding.');
  const stamp = fileStamp(filename);
  if (expectedStamp !== undefined) {
    requireValue(stamp === expectedStamp, 'The verified sprite archive changed before navigation.');
    return { filename, stamp };
  }
  const bytes = readBounded(filename, max);
  requireValue(stamp === fileStamp(filename), 'The file changed during inspection.');
  requireValue(createHash('sha256').update(bytes).digest('hex') === resource.sha256,
    'The file differs from the capture. Review the finding or collect fresh evidence.');
  return { filename, bytes, stamp };
}

function checkedMappedRoot(vscode, mapping) {
  requireValue(vscode.workspace.isTrusted === true && !vscode.env?.remoteName &&
    vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme === 'file' &&
      path.relative(folder.uri.fsPath, mapping.workspacePath) === ''),
  'The mapped project must still be open in a trusted local workspace.');
  const root = fs.realpathSync.native(mapping.workspacePath);
  requireValue(path.relative(root, mapping.root) === '', 'The mapped project root changed. Reopen the project and review the location again.');
  return root;
}

function readMappedText(vscode, mapping, resource, max = MAX_TEXT) {
  const root = checkedMappedRoot(vscode, mapping), filename = canonicalTarget(root, resource);
  requireValue(!dirty(vscode, filename), 'Save or revert the unsaved source changes before reviewing candidates.');
  const stamp = fileStamp(filename), bytes = readBounded(filename, max);
  requireValue(stamp === fileStamp(filename), 'The source changed during inspection.');
  return { filename, content: decode(bytes), sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

function hasLoneCarriageReturn(content) {
  return /\r(?!\n)/.test(content);
}

function eolVariants(content) {
  if (hasLoneCarriageReturn(content)) return [content];
  const lf = content.replace(/\r\n/g, '\n');
  return [...new Set([content, lf, lf.replace(/\n/g, '\r\n')])];
}

function checkedRange(content, range) {
  const lines = content.split(/\r\n|\n|\r/);
  for (const point of [range.start, range.end]) {
    requireValue(point.line < lines.length && point.character <= lines[point.line].length,
      'The captured source range no longer identifies a valid position.');
  }
  return range;
}

function navigationIssue(finding) {
  if (finding.attribution !== 'exact') return 'Source attribution remains uncertain.';
  if (!finding.actions.includes('navigate')) return '';
  if (!finding.locator) return 'No source location was supplied.';
  if (finding.locator.type !== 'source' && !finding.locator.ownerDef) return 'The capture needs exact owner DEF evidence.';
  if (finding.locator.type === 'air' && finding.locator.element !== undefined && !finding.locator.authoredFrame) {
    return 'The capture needs authored AIR frame evidence to verify the element.';
  }
  return '';
}

function verifyBinding(vscode, mapping, finding, services, expectedSpriteStamp) {
  const issue = navigationIssue(finding);
  requireValue(!issue && finding.actions.includes('navigate'), issue || 'This finding requests review only.');
  const root = checkedMappedRoot(vscode, mapping);

  const locator = finding.locator;
  const { filename, bytes, stamp } = verifiedFile(vscode, root, locator,
    locator.type === 'sprite' ? MAX_SFF : MAX_TEXT, expectedSpriteStamp);
  let ownerDef;
  if (locator.ownerDef) {
    const owner = verifiedFile(vscode, root, locator.ownerDef, MAX_TEXT);
    ownerDef = owner.filename;
    if (locator.type === 'source' && services.requireAssignedSource) {
      const assigned = (services.resolveAssigned || require('./related_work').resolveAssigned)(ownerDef, decode(owner.bytes));
      requireValue(Array.isArray(assigned.code) && assigned.code.some(candidate => {
        if (!candidate || !within(root, candidate)) return false;
        try { return path.relative(fs.realpathSync.native(candidate), filename) === ''; }
        catch { return false; }
      }), 'The captured owner DEF does not assign this source file.');
    }
    if (locator.type !== 'source') {
      const ownerText = decode(owner.bytes);
      const { parseDef, sections } = require('./def_model');
      const files = sections(parseDef(ownerText, ownerDef), 'files');
      const assignmentKeys = locator.type === 'air' ? ['anim', 'air'] : ['sprite', 'sff'];
      requireValue(files.length === 1 && files[0].entries.filter(entry => assignmentKeys.includes(entry.normalized)).length === 1,
        'The owner DEF asset assignment is missing or ambiguous.');
      const assigned = (services.resolveAssigned || require('./related_work').resolveAssigned)(ownerDef, ownerText);
      const target = locator.type === 'air' ? assigned.air : assigned.sff;
      requireValue(target && within(root, target) && path.relative(fs.realpathSync.native(target), filename) === '',
        'The captured owner DEF no longer assigns this asset.');
      if (locator.type === 'air') {
        for (const dependency of [assigned.sff, assigned.constants, ...assigned.code].filter(Boolean)) {
          requireValue(within(root, dependency) && (!fs.existsSync(dependency) ||
            within(root, fs.realpathSync.native(dependency))), 'The owner DEF resolves AIR viewer dependencies outside the mapped project.');
        }
      }
    }
  }
  return { filename, bytes, ownerDef, stamp };
}

function prepareNavigation(vscode, mapping, finding, services = {}) {
  const { filename, bytes, ownerDef, stamp } = verifyBinding(vscode, mapping, finding, services);
  const { locator } = finding;
  if (locator.type === 'sprite') {
    const archive = (services.parseSff || require('./sff_reader').parseSffBuffer)(bytes, filename);
    const matches = archive.sprites.filter(sprite => sprite.group === locator.group && sprite.number === locator.image &&
      (locator.physicalIndex === undefined || sprite.index === locator.physicalIndex));
    requireValue(matches.length === 1, 'The sprite is missing or has ambiguous group and image coordinates.');
    return { type: 'sprite', filename, ownerDef, archive, stamp, sourceFingerprint: locator.sha256,
      reference: { group: locator.group, number: locator.image, physicalIndex: matches[0].index } };
  }
  const content = decode(bytes);
  if (locator.type === 'source') {
    return { type: 'source', filename, ownerDef, content, range: checkedRange(content, locator.range) };
  }
  const actions = (services.parseAir || require('./air_preview_model').parseAir)(content).filter(action => action.number === locator.action);
  requireValue(actions.length === 1, 'The AIR action is missing or ambiguous.');
  const action = actions[0], frameIndex = locator.element === undefined ? undefined : locator.element - 1;
  const frame = frameIndex === undefined ? undefined : action.frames[frameIndex];
  requireValue(frameIndex === undefined || frame, 'The AIR element is missing from the captured action.');
  requireValue(ownerDef, 'Exact AIR navigation needs capture evidence for the owner DEF.');
  if (frame) {
    const observed = locator.authoredFrame;
    requireValue(observed && frame.group === observed.group && frame.index === observed.image &&
      frame.rawTime === observed.duration,
    'The element needs matching authored AIR frame evidence. Review the finding if its timing was estimated.');
  }
  const { sourceFingerprint } = require('./air_batch_scope');
  return { type: 'air', filename, ownerDef, action: action.number, frameIndex,
    sourceFingerprints: Object.freeze(eolVariants(content).map(sourceFingerprint)) };
}

async function navigate(vscode, mapping, finding, services = {}, contextIsCurrent = () => true) {
  if (!contextIsCurrent()) return false;
  const plan = prepareNavigation(vscode, mapping, finding, services);
  const uri = vscode.Uri.file(plan.filename);
  const expectedFile = plan.filename, expectedOwner = plan.ownerDef, expectedSpriteStamp = plan.stamp;
  const stillCurrent = () => {
    try {
      if (!contextIsCurrent()) return false;
      const latest = verifyBinding(vscode, mapping, finding, services, expectedSpriteStamp);
      return latest.filename === expectedFile && latest.ownerDef === expectedOwner;
    } catch {
      return false;
    }
  };
  const verifiedOwnerNavigation = plan.ownerDef && plan.type !== 'source' ? {
    ownerDef: plan.ownerDef, player: finding.locator.ownerDef.player,
    assetPath: path.relative(mapping.root, plan.filename).split(path.sep).join('/'),
    ownerPath: path.relative(mapping.root, plan.ownerDef).split(path.sep).join('/')
  } : undefined;
  if (plan.type === 'air') {
    const open = services.openAir || require('./air_viewer').openAirPreview;
    return Boolean(await open(uri, {
      action: plan.action, frameIndex: plan.frameIndex, ownerDef: plan.ownerDef, allowEmpty: true,
      preserveFocus: false, sourceReturnGuard: stillCurrent, verifiedSourceFingerprints: plan.sourceFingerprints,
      verifiedOwnerNavigation
    }));
  }
  if (plan.type === 'sprite') {
    const open = services.openSff || require('./sff_viewer').openSffViewer;
    return Boolean(await open(uri, undefined, plan.reference, {
      ownerDef: plan.ownerDef, sourceFingerprint: plan.sourceFingerprint, archive: plan.archive,
      preserveFocus: false, sourceGuard: stillCurrent, verifiedOwnerNavigation
    }));
  }
  return openVerifiedText(vscode, plan, stillCurrent, 'The source changed before it opened. Review the finding or collect fresh evidence.');
}

async function openVerifiedText(vscode, plan, stillCurrent, changed) {
  requireValue(stillCurrent(), changed);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(plan.filename));
  requireValue(!document.isDirty && stillCurrent(), changed);
  if (!eolVariants(plan.content).includes(document.getText())) {
    throw new Error(hasLoneCarriageReturn(plan.content)
      ? 'The captured source contains a bare CR line ending. IKEMaker cannot verify the exact location after editor normalization.'
      : changed);
  }
  const { start, end } = plan.range;
  const selection = new vscode.Range(start.line, start.character, end.line, end.character);
  await vscode.window.showTextDocument(document, { selection });
  requireValue(!document.isDirty && stillCurrent(), changed);
  return true;
}

function pickerText(value) { return String(value).replace(/\$\(/g, '$ ('); }

function clipboardEvidence(session, finding, body) {
  const { basename, sha256, importedAt } = session.importReceipt;
  const lines = [
    'IKeMeter finding · Historical runtime observation',
    `Finding ID · ${finding.id}`,
    `Import file · ${basename}`,
    `Import SHA-256 · ${sha256}`,
    `Imported · ${importedAt}`,
    finding.message,
    body
  ];
  if (finding.locator) lines.push(`Locator SHA-256 · ${finding.locator.sha256}`);
  if (finding.locator?.ownerDef) lines.push(`Owner DEF SHA-256 · ${finding.locator.ownerDef.sha256}`);
  return lines.join('\n');
}

function findingDetails(capture, finding) {
  const evidence = [
    `Project ${capture.project.id} (${capture.project.root})`,
    `Session ${finding.sessionId}`, `${finding.clock} tick ${finding.tick}`
  ];
  if (finding.epoch !== undefined) evidence.push(`epoch ${finding.epoch}`);
  if (finding.continuityRevision !== undefined) evidence.push(`continuity revision ${finding.continuityRevision}`);
  evidence.push(`${finding.entity.kind} ${finding.entity.id}`);
  const locator = finding.locator;
  if (locator) {
    let location = locator.path;
    if (locator.type === 'air') location += ` · Action ${locator.action}${locator.element === undefined ? '' : `, element ${locator.element}`}`;
    if (locator.type === 'sprite') location += ` · sprite ${locator.group}, ${locator.image}${locator.physicalIndex === undefined ? '' : ` (archive entry ${locator.physicalIndex})`}`;
    if (locator.type === 'source') location += ` · line ${locator.range.start.line + 1}, column ${locator.range.start.character + 1}`;
    evidence.push(location);
    if (locator.ownerDef) evidence.push(`Owner reported by capture: player ${locator.ownerDef.player} · ${locator.ownerDef.path}`);
    if (locator.type === 'air') evidence.push('IKEMaker verifies the AIR text before opening it. Rendering uses the current assigned SFF.');
    if (locator.authoredFrame) {
      const frame = locator.authoredFrame;
      evidence.push(`Authored AIR frame ${frame.group}, ${frame.image} · duration ${frame.duration}`);
    }
  }
  evidence.push(`Confidence ${finding.confidence} · source attribution ${finding.attribution}`);
  if (finding.attribution === 'exact') {
    evidence.push('The capture reports an exact source location. IKEMaker checks the current file and any applicable assignment when opening it. The cause was not traced.');
  }
  const issue = navigationIssue(finding);
  if (issue) evidence.push(issue);
  if (finding.actions.includes('review') && finding.resolution) evidence.push(`Proposed resolution · ${finding.resolution}`);
  return evidence.join('\n');
}

function assertTrustedWorkspace(vscode) {
  requireValue(vscode.workspace.isTrusted === true && !vscode.env?.remoteName,
    'IKeMeter findings require a trusted local workspace.');
}

function createFindingsSession(vscode, services = {}) {
  let current, spriteMapping, busy = false, disposed = false;

  function ownStateContext(finding, linked) {
    const owner = finding.locator?.ownerDef, slot = linked?.slot;
    const { PINNED_ENGINE_SHA256 } = require('./ikemeter_telemetry_model');
    if (linked?.engineSha256 !== PINNED_ENGINE_SHA256 || finding.locator?.type !== 'source' || (!integer(slot, 1) || slot > 4) ||
        linked.ownerSlots?.source !== slot || owner?.player !== slot) return undefined;
    // The pinned callback confirms playerNo matches this redirected root.
    // The state-owner getter reports the slot of the currently active state.
    // Equal slots imply own state for this pin, not controller execution.
    const { OWN_STATE_RELATION } = require('./ikemeter_sprite_mapping_model');
    return { relation: OWN_STATE_RELATION, slot, engineSha256: linked.engineSha256 };
  }

  function notify(method, message) {
    // Non-modal notifications may remain queued after this interaction ends.
    void Promise.resolve(vscode.window[method](message)).catch(() => {});
  }

  function mappedFolder(session) {
    if (!session.mapping) return undefined;
    const { workspacePath, root } = session.mapping;
    try {
      if (vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme === 'file' &&
          path.relative(folder.uri.fsPath, workspacePath) === '') &&
          fs.realpathSync.native(workspacePath) === root) return session.mapping;
    } catch {
      // The saved folder is unavailable. Offer project mapping again.
    }
    session.mapping = undefined;
    return undefined;
  }

  async function chooseMapping(session) {
    const folders = (vscode.workspace.workspaceFolders || []).filter(folder => folder.uri.scheme === 'file');
    requireValue(folders.length, 'Open the local project folder in IKEMaker to map and verify this location.');
    const mapped = await vscode.window.showQuickPick(folders.map(folder => ({
      label: pickerText(folder.name), description: pickerText(folder.uri.fsPath), folder
    })), { title: `Map capture root ${session.capture.project.root} to an open project folder` });
    assertTrustedWorkspace(vscode);
    if (!mapped) return undefined;
    const workspacePath = mapped.folder.uri.fsPath;
    const mapping = { workspacePath, root: fs.realpathSync.native(workspacePath) };
    session.mapping = mapping;
    return mapping;
  }

  async function review(session, linked, contextIsCurrent = () => true) {
    const { capture } = session;
    const selected = linked || await vscode.window.showQuickPick(capture.findings.map(finding => ({
      label: pickerText(finding.message), description: pickerText(`${finding.severity} · ${finding.kind} · ${finding.confidence}`),
      detail: pickerText(`${finding.clock} tick ${finding.tick} · ${finding.entity.kind} ${finding.entity.id}`), finding
    })), { title: `Review IKeMeter Findings · ${capture.project.id}`, matchOnDescription: true, matchOnDetail: true });
    assertTrustedWorkspace(vscode);
    if (disposed || !selected || !contextIsCurrent()) return false;
    const { finding } = selected;
    const epochBound = !linked || finding.epoch !== undefined;
    const ownerPlayer = finding.locator?.ownerDef?.player;
    const ownerBound = !linked || (linked.engineSha256 === require('./ikemeter_telemetry_model').PINNED_ENGINE_SHA256 &&
      integer(ownerPlayer, 1) && ownerPlayer <= 4 &&
      linked.ownerSlots?.[finding.locator.type] === ownerPlayer);
    const canNavigate = epochBound && !!ownerBound && finding.actions.includes('navigate') && !navigationIssue(finding);
    const mapping = canNavigate ? mappedFolder(session) : undefined;
    const details = findingDetails(capture, finding);
    const actions = [];
    const navigationAction = linked ? 'Open Problem' : 'Open Verified Location';
    const runtime = canNavigate ? ownStateContext(finding, linked) : undefined;
    let mappingAction;
    if (runtime) {
      const { ACTION, createSpriteMappingReview } = require('./ikemeter_sprite_mapping');
      spriteMapping ||= (services.createSpriteMappingReview || createSpriteMappingReview)(vscode);
      if (!spriteMapping.evidenceIssue(finding, runtime)) {
        mappingAction = ACTION;
        actions.push(mappingAction);
      }
    }
    if (canNavigate) actions.push(navigationAction);
    if (canNavigate && mapping) actions.push('Change Project Folder');
    actions.push('Copy Evidence');
    const evidence = linked ? `${details}\nTelemetry clip SHA-256 · ${linked.clipSha256}\nLinked sequence ${linked.frameSeq} · player slot ${linked.slot} · lifetime ${linked.generation}${!epochBound ? '\nThe finding has no epoch. The linked evidence is available for review only.' : !ownerBound && finding.locator ? '\nThe clip does not establish the recorded owner for this location.' : ''}` : details;
    const scoped = runtime ? `${evidence}\nAt this sample the state owner and observed player are both slot ${runtime.slot}. IKEMaker derives this relationship using the slot behavior of the pinned engine.` : evidence;
    const detail = mapping ? `${scoped}\nMapped project folder · ${mapping.workspacePath}` : scoped;
    const choice = await vscode.window.showInformationMessage(finding.message, { modal: true, detail }, ...actions);
    assertTrustedWorkspace(vscode);
    if (disposed || !contextIsCurrent()) return false;
    if (choice === 'Copy Evidence') {
      await vscode.env.clipboard.writeText(clipboardEvidence(session, finding, scoped));
      return true;
    }
    if (choice === 'Change Project Folder' && canNavigate && mapping) {
      await chooseMapping(session);
      return true;
    }
    if (mappingAction && choice === mappingAction) {
      const target = mappedFolder(session) || await chooseMapping(session);
      const isCurrent = () => !disposed && current === session && contextIsCurrent() && mappedFolder(session) === target;
      if (!target || !isCurrent()) return false;
      return spriteMapping.review({ mapping: target, finding, runtime, importSha256: session.importReceipt.sha256, isCurrent });
    }
    if (choice !== navigationAction || !canNavigate) return true;
    const target = mappedFolder(session) || await chooseMapping(session);
    if (!target) return true;
    const checkedServices = linked ? { ...services, requireAssignedSource: true } : services;
    const opened = await navigate(vscode, target, finding, checkedServices, contextIsCurrent);
    if (!opened) notify('showWarningMessage', 'The verified location could not open. Check whether the file changed or a viewer edit is pending.');
    return opened;
  }

  async function run(operation) {
    if (busy || disposed) return false;
    busy = true;
    try {
      assertTrustedWorkspace(vscode);
      return await operation();
    } catch (error) {
      notify('showErrorMessage', `IKeMeter findings · ${error.message}`);
      return false;
    } finally {
      busy = false;
    }
  }

  async function reviewTelemetryLink(evidence, contextIsCurrent) {
    let matched = false;
    const result = await run(async () => {
      if (!evidence || typeof contextIsCurrent !== 'function' || !contextIsCurrent() ||
          !/^[a-f0-9]{64}$/.test(evidence.clipSha256 || '') || !integer(evidence.epoch, 1)) return 'unavailable';
      if (!current || evidence.findingsSha256 !== current.importReceipt.sha256) return 'unmatched';
      const finding = current.capture.findings.find(entry => entry.id === evidence.findingId);
      if (!finding || finding.sessionId !== evidence.sessionId ||
          (finding.epoch !== undefined && finding.epoch !== evidence.epoch) ||
          finding.clock !== 'gameTime' || finding.tick !== evidence.tick || finding.entity.kind !== 'player' ||
          String(finding.entity.id) !== String(evidence.entityId)) return 'unmatched';
      matched = true;
      return await review(current, { ...evidence, finding }, contextIsCurrent) ? 'reviewed' : 'closed';
    });
    return { status: result || (matched ? 'closed' : 'unavailable') };
  }

  return {
    importFile(fileUri) {
      return run(async () => {
        if (fileUri !== undefined) {
          requireValue(typeof vscode.Uri === 'function' && fileUri instanceof vscode.Uri,
            'Choose a local findings file using a file URI.');
        }
        const file = fileUri === undefined ? (await vscode.window.showOpenDialog({
          title: 'Import IKeMeter Findings', canSelectFiles: true, canSelectFolders: false,
          canSelectMany: false, filters: { 'IKeMeter findings': ['json'] }
        }) || [])[0] : fileUri;
        assertTrustedWorkspace(vscode);
        if (disposed || !file) return false;
        requireValue(file.scheme === 'file' && typeof file.fsPath === 'string' && path.isAbsolute(file.fsPath),
          'Choose a local findings file.');
        const bytes = readBounded(file.fsPath, MAX_IMPORT);
        const capture = parseFindings(parseJson(decode(bytes)));
        if (!capture.findings.length) {
          notify('showInformationMessage', 'The IKeMeter capture contains no findings.');
          return false;
        }
        // An explicit mapping belongs to this import, even if a later file
        // reports the same project ID and root.
        const importReceipt = Object.freeze({
          basename: path.basename(file.fsPath).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '�'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          importedAt: new Date().toISOString()
        });
        current = { capture, importReceipt };
        return review(current);
      });
    },
    async reviewTelemetryFinding(evidence, contextIsCurrent) {
      return (await reviewTelemetryLink(evidence, contextIsCurrent)).status === 'reviewed';
    },
    reviewTelemetryLink,
    dispose() {
      disposed = true;
      current = undefined;
      spriteMapping?.dispose();
    },
    reopen() {
      return run(async () => {
        if (current) return review(current);
        notify('showInformationMessage', 'Import an IKeMeter findings file to start reviewing findings.');
        return false;
      });
    }
  };
}

function importFindings(vscode, services = {}) {
  return createFindingsSession(vscode, services).importFile();
}

module.exports = { COMMAND, REOPEN_COMMAND, parseJson, parseFindings, prepareNavigation, navigate, createFindingsSession, importFindings,
  relativePath, readMappedText, openVerifiedText, checkedRange };

