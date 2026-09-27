'use strict';

const path = require('path');
const fs = require('fs');
const { parseSelectedClsn2 } = require('./air');
const { actionsIn, createProposal, parseAssignmentInput } = require('./air_clsn2_batch_model');
const { hash } = require('./mutation_safety');

const MAPPING_KEY = 'ikemen.air.clsn2.roleMappings.v1';

function canonical(value) { const resolved = path.resolve(String(value || '')).replace(/\\/g, '/'); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function sameDocument(document, baseline) { return document.uri.toString() === baseline.uri && document.version === baseline.version && document.getText() === baseline.text && hash(document.getText()) === baseline.hash; }
function sourceAction(parsed, number) {
  const matches = parsed.actions.filter((action) => action.number === Number(number));
  if (matches.length !== 1) throw new Error(matches.length ? `Action ${number} is defined more than once. Resolve duplicate AIR action IDs first.` : `Action ${number} could not be located.`);
  return matches[0];
}
function actionText(parsed, action) { return parsed.lines.slice(action.start, action.end).join('\n'); }
function cleanReference(value) { return String(value || '').split(';')[0].trim().replace(/^['"]|['"]$/g, ''); }
function ownerCandidates(airPath) {
  const target = canonical(airPath), candidates = [], seen = new Set();
  let directory = path.dirname(path.resolve(airPath));
  for (let depth = 0; depth < 5; depth += 1) {
    if (fs.existsSync(directory)) {
      for (const name of fs.readdirSync(directory).filter((entry) => /\.def$/i.test(entry))) {
        const defPath = path.join(directory, name), key = canonical(defPath);
        if (seen.has(key)) continue;
        let text; try { text = fs.readFileSync(defPath, 'utf8'); } catch (_) { continue; }
        const match = /^\s*(?:anim|air)\s*=\s*(.+?)\s*$/im.exec(text);
        if (!match || canonical(path.resolve(directory, cleanReference(match[1]))) !== target) continue;
        seen.add(key); candidates.push(defPath);
      }
    }
    if (path.basename(directory).toLowerCase() === 'chars') break;
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  return candidates.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

class AirClsn2BatchService {
  constructor(vscode, context) { this.vscode = vscode; this.context = context; }

  mappingScope(source) { return `${canonical(source.ownerDef || source.airPath)}|${canonical(source.airPath)}`; }
  allMappings() { return this.context?.workspaceState?.get(MAPPING_KEY, {}) || {}; }
  savedMappings(source) { return this.allMappings()[this.mappingScope(source)]?.assignments || {}; }
  async rememberMappings(source, assignments) {
    const existing = this.savedMappings(source);
    const state = { ...this.allMappings(), [this.mappingScope(source)]: { version: 1, ownerDef: source.ownerDef || '', airPath: source.airPath, assignments: { ...existing, ...assignments } } };
    await this.context?.workspaceState?.update(MAPPING_KEY, state);
  }

  async resolveOwnerScope(source) {
    const candidates = ownerCandidates(source.airPath);
    if (candidates.length === 1) return { ...source, ownerDef: candidates[0], ownerScopeLabel: `character owner ${path.basename(candidates[0])}` };
    if (!candidates.length) return { ...source, ownerDef: '', ownerScopeLabel: `AIR-only scope ${path.basename(source.airPath)} (no owning DEF found)` };
    const current = canonical(source.ownerDef || '');
    const items = candidates.map((filename) => ({ label: path.basename(filename), description: canonical(filename) === current ? 'Current viewer owner candidate — choose explicitly because this AIR is shared' : filename, ownerDef: filename }));
    items.push({ label: `AIR-only scope: ${path.basename(source.airPath)}`, description: 'Share remembered role assignments only for this AIR, not for one character DEF.', ownerDef: '' });
    const choice = await this.vscode.window.showQuickPick(items, { title: 'AIR Clsn2 — Remembered assignment owner', placeHolder: 'This AIR is referenced by multiple DEF files. Choose the scope used for reading and optionally remembering assignments.' });
    return choice ? { ...source, ownerDef: choice.ownerDef, ownerScopeLabel: choice.ownerDef ? `character owner ${path.basename(choice.ownerDef)}` : `AIR-only scope ${path.basename(source.airPath)}` } : null;
  }

  async textSource(editor) {
    if (!editor || path.extname(editor.document.fileName).toLowerCase() !== '.air') throw new Error('Open an AIR text editor before applying Clsn2 data.');
    const start = Number(editor.selection?.start?.line), end = Number(editor.selection?.end?.line);
    return { kind: 'text', airPath: editor.document.fileName, document: editor.document, selectionText: editor.document.getText(editor.selection), selectionLines: Number.isInteger(start) && Number.isInteger(end) ? [start + 1, end + 1] : null, ownerDef: '' };
  }

  async visualSource(session, message) {
    if (!session || session.disposed || !session.airPath) throw new Error('The AIR viewer session is no longer available. Reopen the viewer and review the batch again.');
    if (message.pendingGuardPassed !== true) throw new Error('Finish or revert the viewer\'s pending frame, collision, or runtime edits before starting a batch.');
    const document = await this.vscode.workspace.openTextDocument(session.airPath), parsed = actionsIn(document.getText()), action = sourceAction(parsed, message.action), frame = action.frames[Number(message.frameIndex)];
    if (!frame) throw new Error(`Action ${message.action}, element ${Number(message.frameIndex) + 1} could not be located.`);
    const displayed = message.sourceSnapshot || {};
    if (Number(displayed.action) !== action.number || Number(displayed.frameIndex) !== Number(message.frameIndex) || displayed.actionText !== actionText(parsed, action)) {
      throw new Error('The AIR viewer source changed after it was displayed. Refresh the viewer and review the source element again.');
    }
    return {
      kind: 'visual', airPath: session.airPath, ownerDef: session.defPath || '', document,
      sourceAction: action.number, sourceFrame: frame.index, sourceOrigin: frame.source,
      sourceBoxes: frame.effective, session, selection: { action: action.number, frameIndex: frame.index }
    };
  }

  async chooseOperation() {
    const items = [
      { label: 'Replace per-element Clsn2', description: 'Give selected elements explicit copies of the reviewed source boxes.', operation: 'replace' },
      { label: 'Append to effective Clsn2', description: 'Append after inherited/default or explicit effective boxes.', operation: 'append' },
      { label: 'Make selected elements effectively empty', description: 'Uses Clsn2: 0 when a default would otherwise reappear.', operation: 'clearEffective' },
      { label: 'Remove per-element override', description: 'Delete only explicit element blocks; a Clsn2Default may become visible again.', operation: 'removeOverride' },
      { label: 'Replace action with Clsn2Default', description: 'Whole-action operation: remove Clsn2 blocks and add one reviewed default.', operation: 'default' },
      { label: 'Clear every Clsn2 block in actions', description: 'Whole-action operation; removes defaults and element overrides.', operation: 'clearAll' }
    ];
    return this.vscode.window.showQuickPick(items, { title: 'AIR Clsn2 — Operation', placeHolder: 'Choose the exact collision-box behavior' });
  }

  async run(source) {
    const document = source.document || await this.vscode.workspace.openTextDocument(source.airPath);
    const baseline = { uri: document.uri.toString(), version: document.version, text: document.getText(), hash: hash(document.getText()) };
    source = await this.resolveOwnerScope({ ...source, document });
    if (!source) return { status: 'cancelled' };
    const operationChoice = await this.chooseOperation(); if (!operationChoice) return { status: 'cancelled' };
    const operation = operationChoice.operation;
    let boxes = [];
    if (!['clearEffective', 'removeOverride', 'clearAll'].includes(operation)) {
      boxes = source.kind === 'visual' ? source.sourceBoxes : parseSelectedClsn2(source.selectionText, true);
      if (!boxes.length) throw new Error('The reviewed source has no effective Clsn2 boxes. Choose an explicit clear operation instead.');
    }
    const actions = await this.vscode.window.showInputBox({
      title: 'AIR Clsn2 — Target actions', prompt: 'AIR action numbers, ranges, and exclusions. Examples: all, 0-19, 40-49 !40.',
      value: source.kind === 'visual' ? String(source.sourceAction) : 'all', validateInput: (value) => { try { require('./air').parseNumberSet(value); return undefined; } catch (error) { return error.message; } }
    });
    if (actions === undefined) return { status: 'cancelled' };
    const roleChoice = await this.vscode.window.showQuickPick([
      { label: 'All selected actions/elements', role: 'all', description: 'Use only the number and element ranges.' },
      { label: 'Standing role', role: 'stand', description: 'Reviewed stand assignments, including standard Action 12 from displayed element 1.' },
      { label: 'Crouching role', role: 'crouch', description: 'Reviewed crouch assignments, including standard Action 10 from displayed element 1.' },
      { label: 'Airborne role', role: 'air', description: 'Name suggestions do not treat Action 40 jump startup as airborne.' },
      { label: 'Grounded startup role', role: 'grounded-start', description: 'Includes the standard Action 40 grounded-start suggestion.' },
      { label: 'Custom role', role: 'custom', description: 'Only actions explicitly mapped as custom.' },
      { label: 'Unclassified role', role: 'unknown', description: 'Review custom actions that have no known suggestion.' }
    ], { title: 'AIR Clsn2 — Target role', placeHolder: 'Names and standard numbers are suggestions until this review' });
    if (!roleChoice) return { status: 'cancelled' };
    let elements = 'all';
    if (!['default', 'clearAll'].includes(operation)) {
      elements = await this.vscode.window.showInputBox({ title: 'AIR Clsn2 — Target animation elements', prompt: 'Displayed numbers are 1-based. Standard Action 10/12 role suggestions apply from displayed element 1.', value: 'all', validateInput: (value) => { try { require('./air').parseNumberSet(value); return undefined; } catch (error) { return error.message; } } });
      if (elements === undefined) return { status: 'cancelled' };
    }
    let overrides = {}, exclusions = [], remember = false;
    const savedMappings = this.savedMappings(source);
    while (true) {
      const proposal = createProposal(baseline.text, { actions, elements, boxes, operation, role: roleChoice.role, overrides, exclusions, savedMappings });
      const assignmentSummary = proposal.assignments.map((item) => `${item.action}: ${item.role} (${item.source})`).join('\n');
      const changedSummary = proposal.changed.map((item) => `${item.action}: elements ${item.elements.join(', ')}`).join('\n');
      const skippedSummary = proposal.skipped.map((item) => `${item.action}: ${item.reason}`).join('\n') || '(none)';
      const sourceLabel = source.kind === 'visual'
        ? `Action ${source.sourceAction}, element ${source.sourceFrame + 1} (${source.sourceOrigin})`
        : `selected AIR text${source.selectionLines ? `, lines ${source.selectionLines[0]}-${source.selectionLines[1]}` : ''}`;
      const boxSummary = boxes.length ? boxes.map((box, index) => `${index}: ${box.join(', ')}`).join('; ') : '(clear operation; no source boxes)';
      const decision = await this.vscode.window.showWarningMessage(
        `Review Clsn2 batch for ${proposal.changedActions.length} action(s)`,
        { modal: true, detail: `Source: ${sourceLabel}\nAssignment scope: ${source.ownerScopeLabel}\nSource boxes: ${boxSummary}\nOperation: ${operationChoice.label}\nRole: ${roleChoice.label}\n\nAssignments:\n${assignmentSummary || '(none)'}\n\nTargets:\n${changedSummary || '(none — change assignments/targets or cancel)'}\n\nExcluded/skipped:\n${skippedSummary}\n\nUnchanged targets: ${proposal.unchanged.length}.` },
        'Preview Diff', 'Change Assignments'
      );
      if (!decision) return { status: proposal.changed.length && proposal.text !== baseline.text ? 'cancelled' : 'no-op', proposal };
      if (decision === 'Change Assignments') {
        const input = await this.vscode.window.showInputBox({ title: 'AIR Clsn2 — Override or exclude action roles', prompt: 'Examples: 10=crouch, 12=stand, 40=grounded-start, !105. These apply only to this review unless you explicitly remember them.', value: Object.entries(overrides).map(([number, value]) => `${number}=${value}`).concat(exclusions.map((number) => `!${number}`)).join(', '), validateInput: (value) => { try { parseAssignmentInput(value); return undefined; } catch (error) { return error.message; } } });
        if (input === undefined) return { status: 'cancelled', proposal };
        ({ overrides, exclusions } = parseAssignmentInput(input));
        if (Object.keys(overrides).length || exclusions.length) {
          const memory = await this.vscode.window.showQuickPick([
            { label: 'Use once', remember: false, description: 'Keep this review local; no preference is stored.' },
            { label: 'Remember for this owner and AIR', remember: true, description: 'Store only these explicit role assignments in extension workspace state.' }
          ], { title: 'AIR Clsn2 — Assignment memory' });
          if (!memory) return { status: 'cancelled', proposal };
          remember = memory.remember;
        }
        continue;
      }
      if (!proposal.changed.length || proposal.text === baseline.text) { this.vscode.window.showInformationMessage('No matching AIR collision data would change. Change assignments/targets to include a target, or cancel.'); return { status: 'no-op', proposal }; }
      const preview = await this.vscode.workspace.openTextDocument({ content: proposal.text, language: document.languageId });
      await this.vscode.commands.executeCommand('vscode.diff', document.uri, preview.uri, `Clsn2 Preview — ${path.basename(document.fileName)}`, { preview: true });
      const final = await this.vscode.window.showWarningMessage(`Apply the reviewed Clsn2 batch to ${path.basename(document.fileName)}?`, { modal: true, detail: 'The exact reviewed open text remains the baseline. One VS Code Undo step is created; Auto Save behavior is unchanged.' }, 'Apply Changes');
      if (final !== 'Apply Changes') return { status: 'cancelled', proposal };
      const current = await this.vscode.workspace.openTextDocument(document.uri);
      if (!sameDocument(current, baseline)) throw new Error('The AIR source changed while this batch was being reviewed. Nothing was written; run the review again.');
      if (source.kind === 'visual' && (source.session.disposed || canonical(source.session.airPath) !== canonical(source.airPath))) throw new Error('The AIR viewer closed or changed while this batch was being reviewed. Nothing was written.');
      const lastLine = Math.max(0, current.lineCount - 1), edit = new this.vscode.WorkspaceEdit();
      edit.replace(current.uri, new this.vscode.Range(0, 0, lastLine, current.lineAt(lastLine).text.length), proposal.text);
      if (!await this.vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the AIR Clsn2 batch edit.');
      if (remember) await this.rememberMappings(source, { ...overrides, ...Object.fromEntries(exclusions.map((number) => [number, 'excluded'])) });
      if (source.kind === 'visual' && !source.session.disposed) {
        const refreshed = await this.vscode.workspace.openTextDocument(source.airPath);
        await source.session.refreshAfterClsn2?.(refreshed, source.selection);
      }
      this.vscode.window.showInformationMessage(`Applied Clsn2 changes to ${proposal.changedActions.length} action(s) and ${proposal.changedElements} animation element(s).`);
      return { status: 'applied', proposal };
    }
  }
}

function createAirClsn2BatchService(vscode, context) { return new AirClsn2BatchService(vscode, context); }
module.exports = { AirClsn2BatchService, createAirClsn2BatchService, sameDocument, MAPPING_KEY };
