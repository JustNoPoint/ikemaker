'use strict';
const {planTriggerFillDown} = require('./cns_trigger_fill_plan');

// Numbered triggers are OR alternatives. Repeated rows in one group are ANDed.
function parseControllers(lines) {
  const controllers = [];
  let controller;
  for (let line=0;line<lines.length;line++) {
    const raw=lines[line], section=/^\s*\[\s*([^\]]+)\]/.exec(raw);
    if (section) {
      controller=/^state(?:\s|,|$)/i.test(section[1]) ? {header:{line,start:raw.indexOf('['),length:section[0].trimStart().length},groups:new Map(),triggerRows:[],rows:[],typed:false} : null;
      if (controller) controllers.push(controller);
      continue;
    }
    if (!controller) continue;
    if (/^\s*type\s*=\s*[a-z_]/i.test(raw)) controller.typed=true;
    const match=/^(\s*)(trigger(all|\d+))\s*=/i.exec(raw);
    if (!match) continue;
    const row={line,start:match[1].length,length:match[2].length};
    if (match[3].toLowerCase()==='all') {
      controller.shared ||= row;
      controller.triggerRows.push(row);
      continue;
    }
    row.number=Number(match[3]);
    if (row.number<1 || row.number>65536) continue;
    controller.rows.push(row);
    controller.triggerRows.push(row);
    if (!controller.groups.has(row.number)) controller.groups.set(row.number,row);
  }
  return controllers;
}

function renumberChanges({groups, triggerRows}, lines) {
  const numbers = [...groups.keys()].sort((a, b) => a - b);
  const mapping = new Map(numbers.map((number, index) => [number, index + 1]));
  // Stable sorting appends late shared guards after existing ones and keeps AND conditions in source order.
  const ordered = [...triggerRows].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const edits = [];
  for (const [index, source] of ordered.entries()) {
    const target = triggerRows[index];
    const raw = lines[source.line];
    const renumber = source.number !== undefined && mapping.get(source.number) !== source.number;
    const digits = source.start + 7;
    if (source === target) {
      if (renumber) edits.push({line: target.line, start: digits, length: source.length - 7, text: String(mapping.get(source.number))});
      continue;
    }
    const text = renumber ? raw.slice(0, digits) + mapping.get(source.number) + raw.slice(source.start + source.length) : raw;
    edits.push({line: target.line, start: 0, length: lines[target.line].length, text});
  }
  return edits;
}

function triggerProblems(text) {
  const lines = text.split(/\r?\n/), problems = [];
  for (const controller of parseControllers(lines)) {
    if (!controller.typed) continue;
    const { groups, rows, shared, header } = controller;
    const numbers = [...groups.keys()];
    const gap = numbers.findIndex((n,i) => n !== i + 1);
    if (groups.has(1) && gap < 0) continue;
    let firstMissing = 1;
    while (groups.has(firstMissing)) firstMissing++;
    const unreachable = numbers.find(number=>number > firstMissing);
    const missingFirst = firstMissing === 1;
    const anchor = missingFirst ? shared || rows[0] || header : groups.get(unreachable || numbers[gap]);
    const diagnostic = { line: anchor.line, start: anchor.start, length: anchor.length,
      code: missingFirst ? 'cns-missing-trigger1' : 'cns-trigger-group-gap',
      severity: missingFirst ? 'error' : 'warning',
      message: missingFirst ? 'Missing trigger1. This controller can prevent the character from loading. triggerall supplies shared conditions and still needs a numbered trigger.'
        : !unreachable
          ? 'trigger' + numbers[gap] + ' is declared before trigger' + (gap+1) + '. Declare groups consecutively in first-use order for engine compatibility.'
          : 'Missing trigger' + firstMissing + '. The engine can ignore trigger' + unreachable + ' and all groups above the gap. Renumber the alternatives consecutively.' };
    let title, changes;
    if (numbers.length) {
      title = 'Renumber trigger groups in this controller from 1';
      changes = renumberChanges(controller, lines);
    } else {
      const value = shared ? '1' : '0';
      title = shared ? 'Add trigger1 = 1 (use the existing triggerall conditions)' : 'Add trigger1 = 0 (disabled until you set a condition)';
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      changes = [{line:anchor.line,start:lines[anchor.line].length,length:0,text:eol+lines[anchor.line].match(/^\s*/)[0]+'trigger1 = '+value}];
    }
    problems.push({ diagnostic, title, changes });
  }
  return problems;
}

function selectionIncludesLine({start, end}, line) {
  return line >= start.line && (line < end.line || (line === end.line && end.character > 0));
}

async function applyTriggerChanges(vscode, editor, changes) {
  const applied = await editor.edit(builder => {
    for (const change of changes) {
      builder.replace(new vscode.Range(change.line, change.start, change.line, change.start + change.length), change.text);
    }
  });
  if (!applied) return vscode.window.showInformationMessage('The source changed. Select the trigger lines and try again.');
}

function registerTriggerFixes(vscode,context,isAssignedText=()=>false) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.cns.fillTriggerNumbersDown', () => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document;
    if (!doc || (doc.languageId !== 'ikemen-cns' && !isAssignedText(doc))) {
      return vscode.window.showInformationMessage('Open a CNS state source to fill trigger numbers down.');
    }
    const {changes,conflict} = planTriggerFillDown(parseControllers(doc.getText().split(/\r?\n/)),editor.selections);
    if (conflict) return vscode.window.showInformationMessage('Overlapping selections give this trigger different numbers. Select one complete range and try again.');
    if (!changes.length) return vscode.window.showInformationMessage('Select a numbered trigger and the trigger1 lines below it to fill down.');
    return applyTriggerChanges(vscode, editor, changes);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.cns.renumberSelectedTriggers', async () => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document;
    if (!doc || (doc.languageId !== 'ikemen-cns' && !isAssignedText(doc))) {
      return vscode.window.showInformationMessage('Open a CNS state source to renumber its triggers.');
    }
    const selections = editor.selections.filter(selection => !selection.isEmpty);
    const includesLine = line => selections.some(selection => selectionIncludesLine(selection, line));
    const changes = [];
    let found = false;
    const lines = doc.getText().split(/\r?\n/);
    for (const controller of parseControllers(lines)) {
      if (!controller.rows.some(row => includesLine(row.line))) continue;
      found = true;
      const edits = renumberChanges(controller, lines);
      if (!edits.length) continue;
      if (!controller.rows.every(row => includesLine(row.line))) {
        return vscode.window.showInformationMessage('Select all numbered trigger lines in the controller, including repeated groups.');
      }
      if (edits.some(edit => !includesLine(edit.line))) {
        return vscode.window.showInformationMessage('Include the misplaced triggerall lines in your selection to move them above the numbered triggers.');
      }
      changes.push(...edits);
    }
    if (!changes.length) return vscode.window.showInformationMessage(found
      ? 'The selected trigger groups are already consecutive.'
      : 'Select the numbered trigger lines in a CNS controller.');
    return applyTriggerChanges(vscode, editor, changes);
  }));
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider([{language:'ikemen-cns'},{language:'plaintext',pattern:'**/*.[tT][xX][tT]'}], {
    provideCodeActions(document,range,request) {
      if (document.languageId!=='ikemen-cns' && !isAssignedText(document)) return [];
      const diagnostics=request.diagnostics.filter(d=>d.code==='cns-missing-trigger1'||d.code==='cns-trigger-group-gap');
      if (!diagnostics.length) return [];
      const problems=triggerProblems(document.getText());
      return diagnostics.flatMap(d=>{
        const p=problems.find(p=>p.diagnostic.line===d.range.start.line && p.diagnostic.code===d.code);
        if (!p) return [];
        const action=new vscode.CodeAction(p.title,vscode.CodeActionKind.QuickFix);
        action.diagnostics=[d];
        action.command={command:'ikemen.cns.fixTriggerGroups',title:p.title,arguments:[document.uri.toString(),document.version,p.diagnostic.line,p.diagnostic.code]};
        return [action];
      });
    }
  },{providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}),vscode.commands.registerCommand('ikemen.cns.fixTriggerGroups',async(uri,version,line,code)=>{
    const editor=vscode.window.activeTextEditor,doc=editor?.document;
    if (!doc || (doc.languageId!=='ikemen-cns' && !isAssignedText(doc)) || doc.uri.toString()!==uri || doc.version!==version) return vscode.window.showInformationMessage('The source changed. Open Quick Fix on the current trigger warning.');
    const problem=triggerProblems(doc.getText()).find(p=>p.diagnostic.line===line&&p.diagnostic.code===code);
    if (!problem) return;
    return editor.edit(builder=>{for(const change of problem.changes) builder.replace(new vscode.Range(change.line,change.start,change.line,change.start+change.length),change.text);});
  }));
}
module.exports={parseControllers,renumberChanges,triggerProblems,registerTriggerFixes};
