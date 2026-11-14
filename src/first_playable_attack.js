'use strict';

const path = require('path');
const fs = require('fs');
const { parseDef } = require('./def_model');
const { assignedPath } = require('./character_dependency_model');
const { firstAttackArtwork } = require('./first_attack_artwork');
const { reviewStamp, reviewedSteps, inspectAttackSources } = require('./first_attack_review');
const { readSff } = require('./sff_reader');

let resumeControl;

async function firstPlayableAttack(context, seed) {
  const vscode = require('vscode');
  const def = await require('./character_picker').chooseCharacterDef(seed, { title: 'First playable attack — Character' });
  if (!def) return;
  const owner = vscode.Uri.file(def);
  const entries = parseDef((await vscode.workspace.openTextDocument(owner)).getText(), def).sections
    .filter(section => section.name.toLowerCase() === 'files').flatMap(section => section.entries);
  const assigned = key => {
    const matches = entries.filter(entry => entry.key.toLowerCase() === key);
    return matches.length === 1 ? assignedPath(def, matches[0].value, key) : '';
  };
  const sprite = assigned('sprite'), air = assigned('anim');
  if (![sprite, air].every(file => file && fs.existsSync(file))) {
    const choice = await vscode.window.showWarningMessage('Assign one existing SFF and AIR in the character DEF to start this attack.', 'Open DEF');
    if (choice) await vscode.window.showTextDocument(owner);
    return;
  }
  const key = 'ikemaker.firstAttack.' + owner.toString();
  const action = context.workspaceState.get(key, 200);
  const selectedState = context.workspaceState.get(key + '.state');
  const airDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(air));
  const archive = readSff(sprite);
  const artwork = firstAttackArtwork(archive.sprites, airDoc.getText(), action);
  const inputs = [selectedState ?? 'auto', def, (await vscode.workspace.openTextDocument(owner)).getText(), action, airDoc.getText(), archive.buffer];
  const sourceFiles = new Set(entries.filter(entry => /^(cmd|cns|st(?:common|\d*)?)$/i.test(entry.key))
    .map(entry => assignedPath(def, entry.value, entry.key)).filter(Boolean));
  const sources = [];
  for (const file of sourceFiles) {
    const available = fs.existsSync(file);
    const text = available ? (await vscode.workspace.openTextDocument(vscode.Uri.file(file))).getText() : '';
    sources.push({ filename: file, text, available, command: file === assigned('cmd') });
    inputs.push(file, available ? text : '<missing>');
  }
  const authored = inspectAttackSources(sources, action, selectedState);
  const tracked = [{filename:def,text:inputs[2]}, {filename:air,text:inputs[4]}, ...sources];
  const cleanSources = tracked.every(source => source.available !== false
    && !vscode.workspace.textDocuments?.some(doc => path.resolve(doc.fileName) === path.resolve(source.filename) && doc.isDirty)
    && fs.readFileSync(source.filename, 'utf8') === source.text);
  const snapshot = tracked.map(source => ({filename:source.filename,hash:reviewStamp([source.text])}));
  snapshot.push({filename:sprite,hash:reviewStamp([archive.buffer])});
  const stamp = reviewStamp(inputs);
  const reviewKey = key + '.review';
  const review = context.workspaceState.get(reviewKey, {});
  const verified = reviewedSteps(artwork, stamp, review, authored);
  if (!cleanSources) verified.hit = false;
  const changed = (review.snapshot || []).filter(previous => !snapshot.some(current => current.filename === previous.filename && current.hash === previous.hash));
  const resetReason = changed.length ? 'Manual checks reset: ' + changed.map(source => path.basename(source.filename)).join(', ') + ' changed.' : (['state', 'binding', 'hit'].some(step => review[step] && review[step] !== stamp) ? 'Manual checks reset: assigned sources or the selected AIR action / StateDef changed.' : '');
  const open = (command, ...args) => vscode.commands.executeCommand(command, ...args);
  const intake = require('./first_attack_sprite_intake');
  const spriteBinding = {defPath:def,sffPath:sprite,action};
  const admittedSprite = intake.preferred(context.workspaceState,spriteBinding,archive);
  const spriteKey = artwork.missingSprites[0]?.split(',').map(Number) || admittedSprite || [0,0];
  const firstAttackAdmission = {...spriteBinding,record:built=>intake.remember(context.workspaceState,spriteBinding,built)};
  const openAir = async () => { if (!await currentTarget(true)) return; return open('air.openAnimationPreview', vscode.Uri.file(air), {
    ownerDef: def, action, createActionIfMissing: { group: spriteKey[0], index: spriteKey[1] }, preserveFocus: false, frameIndex: Math.max(0, artwork.attackBoxFrame)
  }); };
  const currentTarget = async (checkOnly = false) => {
    // A picker can stay open across edits. Never retarget its source-bound actions.
    const unchanged = (await vscode.workspace.openTextDocument(owner)).getText() === inputs[2]
      && (await vscode.workspace.openTextDocument(vscode.Uri.file(air))).getText() === inputs[4];
    const current = await Promise.all(sources.map(async source => ({ ...source,
      text: source.available ? (await vscode.workspace.openTextDocument(vscode.Uri.file(source.filename))).getText() : '' })));
    if (!unchanged || !fs.readFileSync(sprite).equals(archive.buffer) || current.some((source, index) => source.text !== sources[index].text)) {
      await vscode.window.showWarningMessage('The attack sources changed while this guide was open. Reopen the guide to refresh its editor targets.');
      return null;
    }
    return checkOnly ? true : authored.target;
  };
  const openState = async () => {
    if (!authored.target) return open('ikemen.moveLab.open', owner);
    const target = await currentTarget(); if (!target) return;
    const { behaviorComponentModel } = require('./move_lab_component_model');
    const model = behaviorComponentModel({ defPath: def, folder: path.dirname(def), code: [...sourceFiles] }, vscode.workspace.textDocuments || []);
    const matches = model.components.filter(item => item.kind === 'state' && Number(item.signature) === target.number);
    if (matches.length !== 1 || path.resolve(matches[0].filename) !== path.resolve(target.filename)) {
      await vscode.window.showWarningMessage('This attack StateDef no longer resolves exactly. Reopen the guide.'); return;
    }
    return open('ikemen.moveConstants.open', owner, { integration: 'shell', reference: { componentReference: matches[0].reference } });
  };
  const openCommand = async () => {
    if (authored.target && !await currentTarget()) return;
    return open('ikemen.commandMovelist.openEditor', owner, { referenceName: authored.command || undefined, suppressSourceSelection: true, focusCommandDefinitions: true });
  };
  const openTest = async () => {
    if (!authored.target) return open('ikemen.testSessions.open', owner);
    const target = await currentTarget(); if (!target) return;
    return open('ikemen.testSessions.openMove', { defPath: def, stateNo: target.number, sourceFile: target.filename });
  };
  const steps = [
    { label: 'Import a sprite', description: path.basename(sprite) + ' · sprite ' + spriteKey.join(','), done: artwork.hasSprites && !artwork.missingSprites.length, run: async () => { if (await currentTarget(true)) return open('sff.openAddSprites', vscode.Uri.file(sprite), { group: spriteKey[0], startIndex: spriteKey[1], firstAttackAdmission }); } },
    { label: 'Make the attack animation', description: 'AIR action ' + action + (artwork.ambiguousAction ? ' · duplicate numbers: resolve in AIR source' : artwork.actionExists ? ' · existing action (not created here) · ' + artwork.visibleFrames + ' visible frame(s)' + (artwork.missingSprites.length ? ' · missing sprites: ' + artwork.missingSprites.join('; ') : '') : ' · New Animation: sprite ' + spriteKey.join(',') + ' (change Group / Index in review)'), done: artwork.hasAction, run: openAir },
    { label: 'Add an attack box', description: artwork.invalidAttackBoxes ? 'Compiler-invalid Clsn1: fix collisions in AIR' : 'Valid Clsn1 on a visible attack frame; check HitDef timing in-game', done: artwork.attackBoxFrame >= 0, run: openAir },
    { label: 'Set up the attack state', description: authored.target ? 'StateDef ' + authored.target.number + ' → AIR ' + action + (authored.state ? ' · authored HitDef found' : ' · inspect in Move Lab') : 'Use AIR ' + action + ' and add a HitDef in Move Lab', done: verified.state, run: openState },
    { label: 'Bind the attack button', description: authored.binding ? 'Command ' + authored.command + ' enters State ' + authored.target.number + ' · authored connection' : 'Connect the command to the attack state', done: verified.binding, run: openCommand },
    { label: 'Test the hit in-engine', description: verified.hit ? 'Creator reports a bound-button hit · manual, no captured input proof' : 'Scoped state test in Test Session; separately press the bound button in-game', done: verified.hit, manual: verified.hit, run: openTest }
  ];
  const nextReview = !verified.state ? ['state', 'I verified the attack state uses this AIR action and has a HitDef']
    : !verified.binding ? ['binding', 'I verified the button is bound to this attack state']
    : !verified.hit ? ['hit', 'Record my manual bound-button hit report (not a forced-state test)'] : undefined;
  const confirmations = artwork.attackBoxFrame >= 0 && nextReview ? [{
    label: nextReview[1], description: nextReview[0] === 'hit' && !cleanSources ? 'Save DEF, AIR and assigned source documents before recording an engine test' : 'Self-report for these saved sources; not captured runtime evidence', run: async () => {
      if (!await currentTarget(true)) return;
      const stillClean = tracked.every(source => source.available !== false && !vscode.workspace.textDocuments?.some(doc => path.resolve(doc.fileName) === path.resolve(source.filename) && doc.isDirty) && fs.readFileSync(source.filename, 'utf8') === source.text);
      if (nextReview[0] === 'hit' && (!cleanSources || !stillClean)) { await vscode.window.showWarningMessage('Save or revert the DEF, AIR and assigned sources, then reopen this guide before recording an in-engine hit.'); return; }
      await context.workspaceState.update(reviewKey, { ...review, [nextReview[0]]: stamp, snapshot });
      return firstPlayableAttack(context, owner);
    }
  }] : [];
  const pick = vscode.window.createQuickPick();
  pick.title = path.basename(def) + ' — First playable attack';
  pick.placeholder = resetReason || (!cleanSources ? 'Unsaved source changes: authoring checks use live text; save before testing in-engine.' : authored.state ? 'Authored steps recognized. Test the button in-game; source checks cannot confirm a hit.' : authored.reason);
  pick.items = [...steps.map(step => ({ ...step, label: (step.manual ? '$(account) ' : step.done ? '$(check) ' : '') + step.label })), ...confirmations, {
    label: 'Choose AIR action…', description: String(action), run: async () => {
      const value = await vscode.window.showInputBox({ title: 'First attack AIR action', value: String(action), validateInput: n => /^\d+$/.test(n) && Number(n) <= 2147483647 ? undefined : 'Enter a nonnegative action number.' });
      if (value === undefined) return;
      await context.workspaceState.update(key, Number(value));
      return firstPlayableAttack(context, owner);
    }
  }, {
    label: 'Choose attack StateDef…', description: selectedState === undefined ? 'Auto: ' + (authored.target?.number ?? 'unresolved') : String(selectedState), run: async () => {
      const value = await vscode.window.showInputBox({ title: 'First attack StateDef (independent of AIR action)', value: selectedState === undefined ? '' : String(selectedState), prompt: 'Leave blank to find a unique authored attack state for AIR ' + action + '.', validateInput: n => n === '' || /^\d+$/.test(n) && Number(n) <= 2147483647 ? undefined : 'Enter a nonnegative state number, or leave blank for automatic discovery.' });
      if (value === undefined) return;
      await context.workspaceState.update(key + '.state', value === '' ? undefined : Number(value));
      return firstPlayableAttack(context, owner);
    }
  }];
  const nextStep = steps.findIndex(step => !step.done);
  pick.activeItems = [pick.items[nextStep >= 0 ? nextStep : steps.length - 1]];
  if (verified.hit) pick.placeholder = 'Creator-reported bound-button hit for these saved sources (manual). Choose a step to revisit.';
  const selected = await new Promise(resolve => {
    pick.onDidAccept(() => { resolve(pick.selectedItems[0]); pick.hide(); });
    pick.onDidHide(() => resolve(undefined));
    pick.show();
  });
  pick.dispose();
  if (selected) {
    if (steps.some(step => step.run === selected.run) && vscode.window.createStatusBarItem) {
      resumeControl?.dispose();
      resumeControl = vscode.window.createStatusBarItem(vscode.StatusBarAlignment?.Left, 20);
      resumeControl.text = '$(arrow-left) Back to First playable attack';
      resumeControl.tooltip = 'Resume ' + path.basename(def) + ' from its current assigned sources';
      resumeControl.command = { command: 'ikemen.character.firstPlayableAttack', title: 'Back to First playable attack', arguments: [owner] };
      context.subscriptions?.push(resumeControl);resumeControl.show();
    }
    return selected.run();
  }
}

module.exports = { firstPlayableAttack };
