'use strict';

const fs = require('fs');
const path = require('path');
const { parseAir } = require('./air_preview_model');
const { sourceFingerprint } = require('./air_batch_scope');
const { ownerCandidates } = require('./air_clsn2_batch_service');
const { exactStateSources } = require('./exact_state_sources');
const { pushboxFrameContext, parseSizeboxes, readPushboxPlan, projectPushboxPlan } = require('./pushbox_authoring');
const { resource, readCatalog, changeCatalog, newProfile, newUses, bindingFreshness, summarizeRecipe } = require('./air_pushbox_catalog');
const { createPushboxProfile, createPushboxBinding, listPushboxPlacements, readPushboxInstallation, createPushboxCodeReview, authorizePushboxCodeReview, sizeRecipeRemovesBox } = require('./pushbox_code_links');
const { SCHEMA, hash, applyReviewedWorkspacePatch } = require('./reviewed_workspace_patch_writer');
const { STABLE_TARGET } = require('./engine_registry_model');

const KNOWN_COMMITS = new Set([STABLE_TARGET.commit, '6a09392477650c527c75575a64dd728a2c200c8c']);
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const POSES = { stand: 'Standing', crouch: 'Crouching', air: 'Airborne', down: 'Laydown' };

function sourceSnapshot(vscode, filename, maximum = MAX_SOURCE_BYTES) {
  const document = (vscode.workspace.textDocuments || []).find(item => !item.isClosed && resource(item.fileName) === resource(filename));
  if (!document && (!fs.existsSync(filename) || fs.statSync(filename).size > maximum)) throw new Error('The source is missing or exceeds the preview limit.');
  const text = (document?.getText() ?? fs.readFileSync(filename, 'utf8')).replace(/^\uFEFF/, '');
  if (Buffer.byteLength(text, 'utf8') > maximum) throw new Error('The source exceeds the preview limit.');
  return { file: path.resolve(filename), text, dirty: Boolean(document?.isDirty), revision: document?.version ?? null, document };
}

function capabilities(runtime = {}) {
  const target = runtime.target || {};
  const supported = target.buildId === STABLE_TARGET.buildId || KNOWN_COMMITS.has(String(target.commit || '').toLowerCase());
  return { size: supported, width: supported, playerPush: supported, elementInterval: false };
}

function buildContext(airPath, ownerDef, text, runtime, actions, constantsFingerprint) {
  const context = pushboxFrameContext(text, { ...runtime, ownerDef, actions, constantsFingerprint });
  return { ...context, airIdentity: resource(airPath), capabilities: capabilities(runtime) };
}

function elementReadback(use, context, vscode, assignedSources, recipe) {
  const stale = bindingFreshness(use, context);
  if (!use.binding) return { status: stale ? 'needs-remap' : 'draft', reason: stale, recipe };
  const file = use.binding.placement.file;
  if (!assignedSources.some(source => resource(source) === resource(file))) {
    return { status: 'unresolved-placement', reason: 'The selected DEF’s current state sources no longer include this placement.', file };
  }
  try {
    const source = stateSource(vscode, file, context.ownerDef);
    const readback = readPushboxInstallation({ binding: use.binding, source, context });
    return { ...readback, file, profileDiffers: readback.status === 'installed' && summarizeRecipe(readback.recipe) !== summarizeRecipe(recipe) };
  } catch (error) {
    return { status: 'missing', reason: error.message, file };
  }
}

function stateSource(vscode, filename, ownerDef) {
  const source = sourceSnapshot(vscode, filename);
  return { ...source, ownerDef, ownerAmbiguous: false, engineLanguage: /\.zss$/i.test(filename) ? 'zss' : 'cns' };
}

function assignedInventory(vscode, airPath, ownerDef) {
  if (!ownerDef) return { sources: [], constants: '' };
  const { text } = sourceSnapshot(vscode, ownerDef);
  const assigned = require('./related_work').resolveAssigned(ownerDef, text);
  if (resource(assigned.air) !== resource(airPath)) return { sources: [], constants: '', reason: 'The selected character DEF must explicitly assign this AIR before a state recipe can be placed.' };
  return { sources: exactStateSources(ownerDef, text), constants: assigned.constants };
}

function projectCatalog(vscode, airPath, ownerDef, text, runtime, { constantsText, language = '', languageFor, actions } = {}) {
  const owner = resource(ownerDef), { scope } = readCatalog(airPath, owner);
  const inventory = assignedInventory(vscode, airPath, owner);
  const constantsSource = constantsText ?? (inventory.constants && fs.existsSync(inventory.constants) ? sourceSnapshot(vscode, inventory.constants).text : '');
  const activeLanguage = language || languageFor?.(ownerDef, constantsSource) || '';
  const baselines = parseSizeboxes(constantsSource, { language: activeLanguage });
  const context = buildContext(airPath, owner, text, runtime, actions, sourceFingerprint(JSON.stringify([activeLanguage, constantsSource.replace(/^\uFEFF/, '')])));
  const drafts = projectPushboxPlan(readPushboxPlan(airPath), context);
  const draftGroups = new Map();
  for (const draft of drafts) {
    const geometry = Array.isArray(draft.rect) ? 'Size ' + draft.rect.join(', ') : 'Unresolved geometry';
    if (!draftGroups.has(geometry)) draftGroups.set(geometry, []);
    draftGroups.get(geometry).push(draft);
  }
  const profiles = scope.profiles.map(raw => {
    const profile = createPushboxProfile(raw);
    const uses = scope.uses.filter(use => use.profileId === profile.profileId).map(use => ({
      id: use.installationId, action: use.air.action, elements: use.air.elements.map(element => element.index),
      placement: use.binding?.placement || null,
      evidence: elementReadback(use, context, vscode, inventory.sources, profile.recipe)
    }));
    return { ...profile, description: summarizeRecipe(profile.recipe), uses };
  });
  return {
    owner, ownerLabel: owner ? path.basename(ownerDef) : 'AIR-only scope',
    target: context.targetBuildId || 'Unassigned', supported: Object.values(context.capabilities).includes(true),
    constants: Object.entries(baselines).map(([pose, baseline]) => ({ pose, label: POSES[pose], ...baseline, file: inventory.constants })),
    profiles, frameDrafts: [...draftGroups].map(([geometry, uses]) => ({ geometry, uses })),
    reason: inventory.reason || (owner ? context.capabilities.size ? '' : 'This target needs verified Size, Width, or PlayerPush support before code placement.' : 'Choose a character DEF for a state placement.')
  };
}

function forViewer(vscode, airPath, ownerDef, text, runtime, options) {
  try {
    const { scope } = readCatalog(airPath, ownerDef);
    if (!scope.uses.length) return [];
    return projectCatalog(vscode, airPath, ownerDef, text, runtime, options).profiles.flatMap(profile =>
      profile.uses.map(use => ({
        profile: profile.name, profileId: profile.profileId, useId: use.id, action: use.action, elements: use.elements,
        status: use.evidence.status, reason: use.evidence.reason,
        rect: use.evidence.projectionRect, draftRect: profile.recipe.kind === 'size' && !sizeRecipeRemovesBox(profile.recipe) ? profile.recipe.rect : null,
        description: use.evidence.recipe && summarizeRecipe(use.evidence.recipe),
        dirty: use.evidence.source?.dirty, edited: use.evidence.edited,
        animationScope: use.evidence.animationScope, interactions: use.evidence.interactions || [],
        file: use.placement?.file, line: use.evidence.source?.controllerLine
      }))
    );
  } catch (error) {
    return [{ status: 'unresolved', reason: error.message }];
  }
}

function profileById(scope, id) {
  const profile = scope.profiles.find(item => item.profileId === id);
  if (!profile) throw new Error('The push-box profile changed. Refresh the catalog.');
  return profile;
}

function useById(scope, id) {
  const use = scope.uses.find(item => item.installationId === id);
  if (!use) throw new Error('The push-box binding changed. Refresh the catalog.');
  return use;
}

async function promptProfile(vscode, original) {
  const { window } = vscode;
  const name = await window.showInputBox({ title: 'Push-box profile name', value: original?.name || '', validateInput: value => value.trim() && value.length <= 120 ? undefined : 'Use a name of 1–120 characters.' });
  if (name === undefined) return null;
  const kinds = [
    { label: 'Size rectangle', kind: 'size', fields: 'Left, top, right, bottom. Four zeroes remove Size.', value: '-16, -60, 16, 0', count: 4, parameter: 'rect' },
    { label: 'Width adjustment', kind: 'width', fields: 'Front, back adjustment', value: '0, 0', count: 2, parameter: 'player' },
    { label: 'PlayerPush', kind: 'playerpush', fields: '0 disables push, 1 enables push', value: '1', count: 1, parameter: 'value' }
  ];
  const kind = original ? kinds.find(item => item.kind === original.recipe.kind) : await window.showQuickPick(kinds, { title: 'Push-box profile geometry' });
  if (!kind) return null;
  const current = original?.recipe[kind.parameter], value = await window.showInputBox({
    title: kind.label, prompt: kind.fields, value: Array.isArray(current) ? current.join(', ') : current === undefined ? kind.value : String(current),
    validateInput: input => {
      const parts = input.split(',').map(part => part.trim());
      if (parts.length !== kind.count || parts.some(part => !part || !Number.isFinite(Math.fround(Number(part)))) || (kind.kind === 'playerpush' && !/^[01]$/.test(input.trim()))) return 'Enter the requested finite values.';
      return undefined;
    }
  });
  if (value === undefined) return null;
  const values = value.split(',').map(Number), pose = kind.kind === 'size' ? await window.showQuickPick([
    { label: 'No pose label' }, ...Object.entries(POSES).map(([id, label]) => ({ id, label }))
  ], { title: 'Profile pose' }) : {};
  if (!pose) return null;
  return { name: name.trim(), recipe: { ...original?.recipe, kind: kind.kind, [kind.parameter]: kind.count === 1 ? values[0] : values }, poseHint: pose.id };
}

async function pickElements(vscode, input, defaultElement, marked) {
  const choices = [
    { label: 'Current element', actions: [input], elements: String(defaultElement) },
    { label: 'Element range in selected Action', actions: [input] },
    ...(marked.length ? [{ label: 'Marked Actions', actions: marked }] : [])
  ];
  const choice = await vscode.window.showQuickPick(choices, { title: 'Bind push-box profile to AIR elements' });
  if (!choice) return null;
  const elements = choice.elements || await vscode.window.showInputBox({ title: 'Review element numbers', prompt: 'Enter 1-based numbers, ranges, or all. The same selector applies to each selected Action.', value: 'all' });
  return elements === undefined ? null : { actions: choice.actions, elements };
}

async function choosePlacement(vscode, airPath, ownerDef) {
  const { sources, reason } = assignedInventory(vscode, airPath, ownerDef);
  const choices = sources.filter(filename => fs.existsSync(filename)).map(filename => ({
    label: path.basename(filename), description: /\.zss$/i.test(filename) ? 'ZSS' : 'CNS', detail: filename, filename
  }));
  if (!choices.length) throw new Error(reason || 'This character has no current assigned CNS or ZSS state source.');
  const file = await vscode.window.showQuickPick(choices, { title: 'Choose the recipe’s assigned state source' });
  if (!file) return null;
  const source = stateSource(vscode, file.filename, resource(ownerDef));
  const states = listPushboxPlacements({ ...source, language: source.engineLanguage });
  if (!states.length) throw new Error('This file has no complete unique StateDef placement.');
  const target = await vscode.window.showQuickPick(states.map(item => ({
    ...item, label: `StateDef ${item.stateLabel ?? item.stateOrHook}`, description: `line ${item.line}`
  })), { title: 'Choose an explicit state or update hook' });
  return target && { file: source.file, language: source.engineLanguage, stateOrHook: target.stateOrHook, explicit: true };
}

async function installRecipe(vscode, view, profile, use, command) {
  const original = view.current(), stale = bindingFreshness(use, original.context);
  if (stale) throw new Error(stale);
  if (!original.owner) throw new Error('Choose a character owner to place a recipe.');
  const placement = use.binding?.placement || await choosePlacement(vscode, original.airPath, original.owner);
  if (!placement) return;
  const target = original.context, binding = createPushboxBinding({
    ...use, character: { defIdentity: original.owner }, placement,
    target: { targetBuildId: target.targetBuildId, capabilityFingerprint: target.capabilityFingerprint }
  });
  const document = await vscode.workspace.openTextDocument(placement.file);
  const current = view.current();
  const checkSource = snapshot => {
    if (!assignedInventory(vscode, snapshot.airPath, snapshot.owner).sources.some(file => resource(file) === resource(placement.file))) throw new Error('The explicit source is no longer assigned to this character.');
    return stateSource(vscode, placement.file, snapshot.owner);
  };
  const source = checkSource(current);
  const review = createPushboxCodeReview({ profile, binding, source, context: current.context, generation: view.generation });
  const patch = review.patch, after = source.text.slice(0, patch.start) + patch.text + source.text.slice(patch.end);
  const preview = await vscode.workspace.openTextDocument({ content: after, language: document.languageId });
  await vscode.commands.executeCommand('vscode.diff', document.uri, preview.uri, `Review push box · ${profile.name}`, { preview: true });
  const scope = review.animationScope || 'The action guard uses the active animation number. This can include another character’s AIR through ChangeAnim2.';
  const interactions = review.interactions?.map(item => `OverrideClsn ${item.group} at line ${item.line}`).join(', ');
  const chosen = await vscode.window.showWarningMessage(`Use ${profile.name} for Action ${use.air.action}?`, {
    modal: true, detail: `${path.basename(placement.file)} · StateDef ${review.stateLabel ?? placement.stateOrHook} · ${placement.language.toUpperCase()}\nElements ${use.air.elements.map(element => element.index).join(', ')}\n\n${scope}${interactions ? '\nControllers that may interact: ' + interactions : ''}\nReview the state or hook and competing controllers in a test run.`
  }, ...(command === 'copy' ? ['Copy Reviewed Recipe'] : ['Apply Code Edit', 'Copy Reviewed Recipe']));
  if (!chosen) return;
  const latest = view.current();
  const liveProfile = profileById(latest.scope, profile.profileId), liveUse = useById(latest.scope, use.installationId);
  if (JSON.stringify(liveUse) !== JSON.stringify(use)) throw new Error('The recipe binding changed during review. Refresh and review again.');
  const fresh = checkSource(latest);
  const authorized = authorizePushboxCodeReview({ review, message: review.intent, profile: liveProfile, binding, source: fresh, context: latest.context });
  changeCatalog(latest.airPath, latest.owner, scope => ({
    ...scope, uses: scope.uses.map(item => item.installationId === use.installationId ? { ...item, binding } : item)
  }));
  if (chosen === 'Copy Reviewed Recipe') {
    await vscode.env.clipboard.writeText(authorized.text);
    return 'Copied the reviewed linked recipe.';
  }
  if (fresh.text === after) return 'The current source already matches the recipe.';
  const { start, end, text } = authorized, expected = fresh.text.slice(0, start) + text + fresh.text.slice(end);
  const operation = Object.freeze({
    schema: SCHEMA, version: 1, sourcePath: fresh.file, policy: start === end ? 'insert' : 'replace', start, end,
    before: fresh.text.slice(start, end), replacement: text, beforeHash: hash(fresh.text), afterHash: hash(expected),
    sourceWasOpen: true, sourceWasDirty: fresh.dirty, documentVersion: fresh.revision
  });
  await applyReviewedWorkspacePatch(fresh.document, operation, vscode);
  const parsed = readPushboxInstallation({ binding, source: stateSource(vscode, fresh.file, latest.owner), context: latest.context });
  if (parsed.status === 'installed' && parsed.revisionDigest) {
    const lastParsed = { revisionDigest: parsed.revisionDigest, status: parsed.status };
    try {
      changeCatalog(latest.airPath, latest.owner, current => ({
        ...current, uses: current.uses.map(item => item.installationId === binding.installationId && JSON.stringify(item.binding) === JSON.stringify(binding)
          ? { ...item, binding: createPushboxBinding({ ...binding, lastParsed }) } : item)
      }));
    } catch (error) {
      void vscode.window.showWarningMessage('Code was applied. The catalog will re-read current source when refreshed. ' + error.message);
    }
  }
  void vscode.window.showInformationMessage?.('Applied a reviewed push-box code edit. Use the source editor to review and save it.');
  return 'Applied one undoable state-code edit. Source is open for review and saving.';
}

async function handlePushCatalog(vscode, record, message, services) {
  const airPath = record.data.airPath, fingerprint = record.data.sourceFingerprint;
  const ownerContext = resource(airPath) + '|' + resource(record.data.ownerDef);
  if (record.pushCatalogOwnerContext !== ownerContext) {
    record.pushCatalogOwner = undefined;
    record.pushCatalogOwnerContext = ownerContext;
  }
  let ownerDef = record.pushCatalogOwner ?? record.data.ownerDef;
  const candidates = [record.data.ownerDef, ...ownerCandidates(airPath)].filter(Boolean);
  const owners = [...new Map(candidates.map(filename => [resource(filename), filename])).values()];
  if (!ownerDef && owners.length === 1 && record.pushCatalogOwner !== '') ownerDef = owners[0];
  if (message.type === 'pushCatalogChooseOwner') {
    const choice = await vscode.window.showQuickPick([
      ...owners.map(file => ({ label: path.basename(file), detail: file, owner: file })),
      { label: 'AIR-only scope', owner: '' }
    ], { title: 'Push-box catalog owner' });
    if (!choice || !services.current()) return;
    record.pushCatalogOwner = choice.owner;
    ownerDef = choice.owner;
  }
  if (!ownerDef && owners.length > 1 && record.pushCatalogOwner === undefined) {
    await services.post({ type: 'pushCatalogSnapshot', catalog: { ownerChoices: true, reason: 'Choose the character owner or the AIR-only scope.', profiles: [], constants: [] } });
    return;
  }
  const owner = resource(ownerDef), current = () => {
    if (!services.current()) throw new Error('The AIR browser changed during review.');
    const { text } = sourceSnapshot(vscode, airPath, 16 * 1024 * 1024);
    if (sourceFingerprint(text) !== fingerprint) throw new Error('The AIR source changed. Refresh the browser and select the elements again.');
    const runtime = services.runtime(airPath), actions = parseAir(text);
    return { airPath, owner, text, runtime, actions, context: buildContext(airPath, owner, text, runtime, actions), scope: readCatalog(airPath, owner).scope };
  };
  const initial = current(), { scope } = initial;
  let status = '';
  if (message.type === 'pushCatalogOpenConstants') {
    const file = assignedInventory(vscode, airPath, owner).constants;
    if (!file) throw new Error('Choose a character with an assigned constants file.');
    const source = sourceSnapshot(vscode, file);
    const baseline = parseSizeboxes(source.text, { language: services.language?.(owner, source.text) || '' })[message.pose];
    if (!baseline?.line || baseline.localizedLines.length) throw new Error('Resolve the Size source before opening its constants line.');
    await services.openSource(file, baseline.line, {
      text: source.text, revision: source.revision,
      assigned: () => resource(assignedInventory(vscode, airPath, owner).constants) === resource(file)
    });
    return;
  }
  if (message.type === 'pushCatalogEdit') {
    const command = message.command, profile = message.profileId ? profileById(scope, message.profileId) : null;
    const use = message.useId ? useById(scope, message.useId) : null;
    if (use && use.profileId !== profile?.profileId) throw new Error('This binding belongs to another profile.');
    const change = update => {
      const latest = current();
      if (profile && JSON.stringify(profileById(latest.scope, profile.profileId)) !== JSON.stringify(profile)) throw new Error('The selected profile changed during review.');
      if (use && JSON.stringify(useById(latest.scope, use.installationId)) !== JSON.stringify(use)) throw new Error('The selected binding changed during review.');
      return changeCatalog(airPath, owner, update);
    };
    if (command === 'new' || command === 'edit') {
      const input = await promptProfile(vscode, profile);
      if (!input) return;
      const uses = profile ? scope.uses.filter(item => item.profileId === profile.profileId) : [];
      const choice = uses.length ? await vscode.window.showQuickPick([
        ...(use ? [{ label: 'This binding only', id: 'one' }] : []),
        { label: `All ${uses.length} linked binding(s)`, detail: uses.map(item => `Action ${item.air.action}`).join(', '), id: 'all' }
      ], { title: 'Review which bindings use the updated profile' }) : { id: 'all' };
      if (!choice) return;
      const edited = !profile || choice.id === 'one' ? newProfile(input) : createPushboxProfile({ ...profile, ...input });
      change(value => ({
        ...value, profiles: [...value.profiles.filter(item => item.profileId !== edited.profileId), edited],
        uses: choice.id === 'one' ? value.uses.map(item => item.installationId === use.installationId ? { ...item, profileId: edited.profileId, binding: item.binding && { ...item.binding, profileId: edited.profileId } } : item) : value.uses
      }));
      status = 'Profile saved. Review individual source replacements before applying code.';
    } else if (command === 'rename' || command === 'duplicate') {
      const name = await vscode.window.showInputBox({ title: command === 'rename' ? 'Rename push-box profile' : 'Duplicate push-box profile', value: profile.name + (command === 'duplicate' ? ' copy' : '') });
      if (!name?.trim()) return;
      const next = command === 'duplicate' ? newProfile({ ...profile, name: name.trim() }) : createPushboxProfile({ ...profile, name: name.trim() });
      change(value => ({ ...value, profiles: [...value.profiles.filter(item => item.profileId !== next.profileId), next] }));
      status = command === 'duplicate' ? 'Profile duplicated.' : 'Profile renamed.';
    } else if (command === 'bind' || command === 'remap') {
      const marked = Array.isArray(message.marked) ? message.marked.filter(Number.isSafeInteger) : [];
      const selection = await pickElements(vscode, message.action ?? use?.air.action, Number(message.element), command === 'remap' ? [] : marked);
      if (!selection) return;
      const uses = newUses(profile.profileId, initial.actions, selection.actions, selection.elements, initial.context);
      if (command === 'remap' && uses.length !== 1) throw new Error('Review one replacement binding at a time.');
      const preservePlaced = command === 'remap' && Boolean(use.binding);
      const targetList = uses.map(item => `Action ${item.air.action} · elements ${item.air.elements.map(element => element.index).join(', ')}`).join('\n');
      const detail = targetList + (preservePlaced ? '\n\nThe older source placement is still available for review. The new targets receive a separate unplaced binding.' : '');
      if (await vscode.window.showWarningMessage(`Bind ${profile.name} to ${uses.length} Action(s)?`, { modal: true, detail }, 'Save Bindings') !== 'Save Bindings') return;
      change(value => ({
        ...value,
        uses: command === 'remap' && !preservePlaced
          ? value.uses.map(item => item.installationId === use.installationId ? { ...item, air: uses[0].air } : item)
          : [...value.uses, ...uses]
      }));
      status = 'Saved reviewed AIR bindings.';
    } else if (command === 'unlink') {
      if (await vscode.window.showWarningMessage(`Unlink Action ${use.air.action} from ${profile.name}?`, { modal: true, detail: 'This removes the catalog binding. Installed state code remains in its source file.' }, 'Unlink Binding') !== 'Unlink Binding') return;
      change(value => ({ ...value, uses: value.uses.filter(item => item.installationId !== use.installationId) }));
      status = 'Binding removed from the catalog.';
    } else if (command === 'install' || command === 'copy') {
      status = await installRecipe(vscode, { current, generation: record.bindingGeneration }, profile, use, command);
    } else if (command === 'open') {
      const evidence = elementReadback(use, initial.context, vscode, assignedInventory(vscode, airPath, owner).sources, profile.recipe);
      const file = use.binding?.placement.file;
      if (!file || !assignedInventory(vscode, airPath, owner).sources.some(source => resource(source) === resource(file))) throw new Error('The explicit source placement is unavailable.');
      const source = stateSource(vscode, file, owner);
      const fallback = listPushboxPlacements({ ...source, language: source.engineLanguage }).find(item => item.stateOrHook === use.binding.placement.stateOrHook);
      const line = evidence.source?.controllerLine || fallback?.line;
      if (!line) throw new Error('The linked controller and its explicit StateDef are unavailable.');
      await services.openSource(file, line, {
        text: source.text, revision: source.revision,
        assigned: () => assignedInventory(vscode, airPath, owner).sources.some(filename => resource(filename) === resource(file))
      });
      return;
    } else if (command === 'preview') {
      if (bindingFreshness(use, initial.context)) throw new Error('Review the changed AIR binding before previewing it.');
      await vscode.commands.executeCommand('air.openAnimationPreview', vscode.Uri.file(airPath), {
        action: use.air.action, frameIndex: use.air.elements[0].index - 1, ownerDefs: owner ? [owner] : [],
        pushboxPreview: { profileId: profile.profileId, useId: use.installationId }
      });
      return;
    } else throw new Error('Choose a current Push Boxes action.');
    services.changed?.(airPath);
  }
  const latest = current();
  await services.post({ type: 'pushCatalogSnapshot', status, catalog: {
    ...projectCatalog(vscode, airPath, owner, latest.text, latest.runtime, { actions: latest.actions, languageFor: services.language }),
    ownerChoices: owners.length > 1 || Boolean(record.pushCatalogOwner !== undefined)
  } });
}

async function dispatchPushCatalogMessage(vscode, record, message, services) {
  const renderToken = message.renderToken;
  const rendererCurrent = () => services.current() && record.browserRenderToken === renderToken;
  if (!rendererCurrent()) return;
  const post = payload => rendererCurrent() && services.post({ ...payload, request: message.request, renderToken });
  const mutation = message.type === 'pushCatalogEdit' && !['open', 'preview'].includes(message.command);
  if (record.pushCatalogBusy) {
    if (message.type === 'pushCatalogSnapshot') {
      record.pendingPushCatalogSnapshot = () => dispatchPushCatalogMessage(vscode, record, message, services);
    } else await post({ type: 'pushCatalogFinished', error: 'Finish the current browser operation first.' });
    return;
  }
  if (mutation && record.mutationBusy) {
    await post({ type: 'pushCatalogFinished', error: 'Finish the current browser operation first.' });
    return;
  }
  record.pushCatalogBusy = true;
  if (mutation) record.mutationBusy = true;
  let answered = false;
  try {
    await handlePushCatalog(vscode, record, message, {
      ...services, post: payload => { answered = true; return post(payload); }
    });
  } catch (error) {
    answered = true;
    await post({ type: 'pushCatalogFinished', error: error.message });
  } finally {
    record.pushCatalogBusy = false;
    if (mutation) record.mutationBusy = false;
    if (!answered) await post({ type: 'pushCatalogFinished' });
    const refresh = record.pendingPushCatalogSnapshot;
    record.pendingPushCatalogSnapshot = null;
    if (refresh) await refresh();
  }
}

module.exports = { projectCatalog, forViewer, handlePushCatalog, dispatchPushCatalogMessage, capabilities };
