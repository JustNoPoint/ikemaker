'use strict';

const path = require('path');
const model = require('./statedef_authoring');

function supported(document) {
  if (!document) return false;
  if (document.languageId === 'zss') return true;
  return document.languageId === 'ikemen-cns' && /\.(?:cns|st)$/i.test(document.fileName || '');
}
function grammar(document) { return document?.languageId === 'ikemen-cns' ? 'cns' : 'zss'; }
function normalizeFilename(filename) { return path.resolve(String(filename || '.')).toLowerCase(); }

function suggestedStateNumber(text, offset) {
  const source = String(text || ''), limit = Math.max(0, Math.min(source.length, Number(offset) || 0));
  const before = source.slice(0, limit), pattern = /^\s*\[\s*StateDef\s+([+-]?\d+)\b/gim;
  let match, nearest = null, highest = null;
  while ((match = pattern.exec(source))) {
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) continue;
    if (match.index <= limit) nearest = value;
    if (value >= 0 && (highest === null || value > highest)) highest = value;
  }
  if (nearest !== null && nearest >= 0) return nearest + 1;
  if (highest !== null) return highest + 1;
  return 200;
}

function exactSources(document, catalog) {
  const records = [], seen = new Set(), add = source => {
    const filename = source?.filename || source?.fileName;
    if (!filename || typeof source.text !== 'string') return;
    const key = normalizeFilename(filename); if (seen.has(key)) return; seen.add(key);
    records.push({ filename, languageId: source.languageId || source.syntax || (/\.(?:cns|st)$/i.test(filename) ? 'ikemen-cns' : 'zss'), text: source.text, available: source.available !== false });
  };
  add({ filename: document.fileName, languageId: document.languageId, text: document.getText() });
  for (const entry of catalog?.entries || []) add(entry);
  return records;
}

async function pickEnum(vscode, title, values, current = '') {
  const picked = await vscode.window.showQuickPick([
    { label: 'None', description: 'Omit this StateDef property.', value: '' },
    ...values.map(value => ({ label: value, value }))
  ], { title, placeHolder: current ? `Current preset: ${current}` : 'Choose an exact value or omit this property.' });
  return picked?.value;
}

async function openExisting(vscode, match) {
  if (!match?.filename) return false;
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(match.filename));
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const position = new vscode.Position(Math.max(0, Number(match.line) || 0), 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return true;
}

async function createStateDef(vscode, options = {}) {
  const editor = vscode.window.activeTextEditor, document = editor?.document;
  if (!supported(document)) return vscode.window.showWarningMessage('Open a writable ZSS, CNS, or ST source before creating a StateDef.');
  const sourceUri = document.uri.toString(), sourceVersion = document.version, sourceText = document.getText();
  const unchanged = () => !document.isClosed && document.uri.toString() === sourceUri && document.version === sourceVersion && document.getText() === sourceText;
  let catalog = null;
  try { catalog = await options.getStateCatalog?.(document); } catch (_) {}
  const sources = exactSources(document, catalog), inventoryComplete = Boolean(catalog?.complete);
  let number;
  while (number === undefined) {
    const raw = await vscode.window.showInputBox({
      title: 'Create New StateDef · Number',
      prompt: `Enter the exact StateDef number.${inventoryComplete ? ' Complete assigned-source duplicate checking is active.' : ' Duplicate checking is limited to the current/available source inventory.'}`,
      value: String(suggestedStateNumber(sourceText, document.offsetAt(editor.selection.active))),
      validateInput: value => { try { model.stateNumber(value); return undefined; } catch (error) { return error.message; } }
    });
    if (raw === undefined) return null;
    const candidate = model.stateNumber(raw), duplicates = model.existingStateDefs(sources, candidate);
    if (!duplicates.length) { number = candidate; break; }
    const first = duplicates[0], action = await vscode.window.showWarningMessage(`StateDef ${candidate} already exists.`, { modal: true, detail: duplicates.slice(0, 8).map(item => `${item.filename}:${item.line + 1}`).join('\n') }, 'Open Existing', 'Choose Another Number');
    if (action === 'Open Existing') { await openExisting(vscode, first); return null; }
    if (action !== 'Choose Another Number') return null;
  }
  const scopeLabel = number < 0 ? ' · Global/shared hook' : '';
  const name = await vscode.window.showInputBox({ title: `StateDef ${number}${scopeLabel} · Name`, prompt: 'Optional readable state name/comment.', value: '' });
  if (name === undefined) return null;
  const preset = await vscode.window.showQuickPick(model.HEADER_PRESETS.map(item => ({ label: item.label, description: item.id === 'custom' ? 'Choose each StateDef header property.' : `${item.stateType}/${item.moveType}/${item.physics}`, item })), { title: `StateDef ${number} · Header`, placeHolder: 'Choose a starting header preset. You can review exact values before insertion.' });
  if (!preset) return null;
  let stateType = preset.item.stateType, moveType = preset.item.moveType, physics = preset.item.physics;
  if (preset.item.id === 'custom') {
    stateType = await pickEnum(vscode, 'State type', model.STATE_TYPES); if (stateType === undefined) return null;
    moveType = await pickEnum(vscode, 'Move type', model.MOVE_TYPES); if (moveType === undefined) return null;
    physics = await pickEnum(vscode, 'Physics', model.PHYSICS_TYPES); if (physics === undefined) return null;
  }
  const extras = await vscode.window.showQuickPick([
    { label: 'Default animation', description: 'Add anim to the StateDef header.', id: 'anim' },
    { label: 'Initial control value', description: 'Add ctrl to the StateDef header.', id: 'ctrl' }
  ], { title: `StateDef ${number} · Optional header values`, placeHolder: 'Select any additional header values.', canPickMany: true });
  if (extras === undefined) return null;
  let anim = '', ctrl = '';
  if (extras.some(item => item.id === 'anim')) { anim = await vscode.window.showInputBox({ title: `StateDef ${number} · Default animation`, prompt: 'Enter an animation expression or literal number.', value: String(number) }); if (anim === undefined) return null; }
  if (extras.some(item => item.id === 'ctrl')) { ctrl = await vscode.window.showInputBox({ title: `StateDef ${number} · Initial control`, prompt: 'Enter the StateDef ctrl expression.', value: '0' }); if (ctrl === undefined) return null; }
  const capabilities = options.getCapabilities?.(document.uri) || {}, controllerCatalog = options.getCatalog?.() || options.catalog || [], choices = model.controllerChoices(controllerCatalog, capabilities);
  const first = await vscode.window.showQuickPick([
    { label: 'None — create an empty StateDef', description: 'Add the first statement or controller later.', controller: null },
    ...choices.map(item => ({ label: item.name, description: item.description, detail: `Required: ${item.required.join(', ') || 'none'}`, controller: item }))
  ], { title: `StateDef ${number} · First statement/controller`, placeHolder: 'Choose an optional first state controller. This list is searchable.' });
  if (!first) return null;
  let controllerName = '', optionalNames = [], values = {}, condition = '';
  if (first.controller) {
    controllerName = first.controller.name;
    const optional = first.controller.optional.length ? await vscode.window.showQuickPick(first.controller.controller.params.filter(item => !item.required).map(parameter => ({ label: parameter.name, description: parameter.description || parameter.placeholder || 'Optional controller argument', parameter })), { title: `${controllerName} · Optional arguments`, placeHolder: `Required arguments: ${first.controller.required.join(', ') || 'none'}. Select only optional arguments needed here.`, canPickMany: true }) : [];
    if (optional === undefined) return null;
    optionalNames = optional.map(item => item.parameter.name);
    const selected = new Set([...first.controller.required, ...optionalNames]);
    for (const parameter of first.controller.controller.params.filter(item => selected.has(item.name))) {
      const value = await vscode.window.showInputBox({ title: `${controllerName}.${parameter.name}`, prompt: parameter.required ? 'Required controller argument.' : 'Selected optional controller argument.', placeHolder: parameter.placeholder || 'value', validateInput: input => input.trim() ? undefined : `Enter a reviewed value for ${parameter.name}.` });
      if (value === undefined) return null; values[parameter.name] = value;
    }
    condition = await vscode.window.showInputBox({ title: `${controllerName} · Condition`, prompt: grammar(document) === 'cns' ? 'Optional trigger1 expression. Blank uses trigger1 = 1.' : 'Optional condition. Blank inserts the controller unconditionally.', value: '' });
    if (condition === undefined) return null;
  }
  const experienceKey = document.languageId === 'ikemen-cns' ? 'experience.cns' : 'experience.zss';
  const experience = vscode.workspace.getConfiguration('ikemenZss', document.uri).get(experienceKey, 'learning');
  let plan;
  try { plan = model.createStateDefPlan({ language: grammar(document), number, name, stateType, moveType, physics, anim, ctrl, controllerName, optionalNames, values, condition, experience }, { catalog: controllerCatalog, capabilities, sources }); }
  catch (error) { await vscode.window.showErrorMessage(`StateDef was not created: ${error.message}`); return null; }
  const inventoryNote = inventoryComplete ? 'Duplicate check: complete assigned runtime state inventory.' : 'Duplicate check: current and available sources only; the owning runtime inventory is incomplete.';
  const scopeNote = number < 0 ? 'Scope: negative StateDef — global/shared hook. Runtime ownership is not inferred.' : 'Scope: ordinary nonnegative StateDef.';
  const answer = await vscode.window.showInformationMessage(plan.summary, { modal: true, detail: `${plan.text}\n${scopeNote}\n${inventoryNote}\n\nThe complete block will be appended to ${path.basename(document.fileName)} as one undoable edit. It will not be saved to disk automatically.` }, 'Insert StateDef');
  if (answer !== 'Insert StateDef') return null;
  if (!unchanged() || vscode.window.activeTextEditor?.document.uri.toString() !== sourceUri) { await vscode.window.showWarningMessage('The source or active editor changed while the StateDef was being reviewed. Nothing was inserted.'); return null; }
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n', generated = plan.text.replace(/\r?\n/g, eol), separator = sourceText.length && !sourceText.endsWith(`${eol}${eol}`) ? (sourceText.endsWith(eol) ? eol : `${eol}${eol}`) : '';
  const position = document.positionAt(sourceText.length), inserted = `${separator}${generated}`;
  if (!await editor.edit(builder => builder.insert(position, inserted), { undoStopBefore: true, undoStopAfter: true })) { await vscode.window.showErrorMessage('VS Code did not insert the reviewed StateDef. Nothing was saved.'); return null; }
  const start = document.positionAt(sourceText.length + separator.length), end = document.positionAt(sourceText.length + inserted.length);
  editor.selection = new vscode.Selection(start, start); editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  await vscode.window.showInformationMessage(`Created StateDef ${number} in the open document. Use Undo to remove the entire insertion; Save remains separate.`);
  return plan;
}

function register(vscode, context, options = {}) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.statedef.create', () => createStateDef(vscode, options)));
}

module.exports = { supported, grammar, suggestedStateNumber, exactSources, createStateDef, register };
