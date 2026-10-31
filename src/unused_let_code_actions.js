'use strict';
const { analyzeUnusedLets } = require('./unused_let_analysis');

function actionFor(issue) {
  if (!issue || !['remove', 'preserve-call'].includes(issue.fixKind)) return null;
  return {
    title: issue.fixKind === 'preserve-call' ? 'Replace unused result with call' : 'Remove unused local',
    replacement: issue.fixKind === 'preserve-call' ? issue.replacement : '',
    statementStart: issue.statementStart,
    statementEnd: issue.statementEnd,
    expectedText: issue.expectedText
  };
}

function safeActions(text) {
  return analyzeUnusedLets(text).issues
    .map(actionFor)
    .filter(Boolean)
    .sort((left, right) => left.statementStart - right.statementStart);
}

function registerUnusedLetCodeActions(vscode, context) {
  const command = 'zss.fixUnusedLet', batchCommand = 'zss.reviewFixAllUnusedLets';
  context.subscriptions.push(
    vscode.commands.registerCommand(command, async (request) => {
      if (!request?.uri || !Number.isInteger(request.statementStart) || !Number.isInteger(request.statementEnd)) return;
      const uri = vscode.Uri.parse(request.uri), document = await vscode.workspace.openTextDocument(uri), text = document.getText();
      if (document.version !== request.version || text.slice(request.statementStart, request.statementEnd) !== request.expectedText) {
        return vscode.window.showWarningMessage('The ZSS source changed after this unused-local fix was prepared. Review the updated diagnostic and try again.');
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(request.statementStart), document.positionAt(request.statementEnd)), request.replacement || '');
      if (!await vscode.workspace.applyEdit(edit)) vscode.window.showErrorMessage('IKEMaker could not apply the unused-local fix. No source was changed.');
    }),
    vscode.commands.registerCommand(batchCommand, async (request) => {
      if (!request?.uri || !Number.isInteger(request.version)) return;
      const uri = vscode.Uri.parse(request.uri), document = await vscode.workspace.openTextDocument(uri), text = document.getText();
      if (document.version !== request.version) return vscode.window.showWarningMessage('The ZSS source changed after this cleanup review was prepared. Review the updated diagnostics and try again.');
      const fixes = safeActions(text);
      if (!fixes.length) return vscode.window.showInformationMessage('No safe unused-local fixes remain in this ZSS file.');
      const preview = fixes.slice(0, 20).map((fix, index) => {
        const line = document.positionAt(fix.statementStart).line + 1;
        return `${index + 1}. Line ${line}: ${fix.expectedText.trim()}\n   → ${fix.replacement || '(remove declaration)'}`;
      }).join('\n') + (fixes.length > 20 ? `\n…plus ${fixes.length - 20} additional safe fix(es).` : '');
      const choice = await vscode.window.showWarningMessage(
        `Apply ${fixes.length} reviewed safe unused-local fix${fixes.length === 1 ? '' : 'es'}?`,
        { modal: true, detail: `${preview}\n\nUncertain or effectful expressions are not included.` },
        'Apply Safe Fixes'
      );
      if (choice !== 'Apply Safe Fixes') return;
      const latest = document.getText();
      if (document.version !== request.version || fixes.some(fix => latest.slice(fix.statementStart, fix.statementEnd) !== fix.expectedText)) {
        return vscode.window.showWarningMessage('The ZSS source changed during cleanup review. No fixes were applied.');
      }
      const edit = new vscode.WorkspaceEdit();
      for (const fix of fixes) edit.replace(uri, new vscode.Range(document.positionAt(fix.statementStart), document.positionAt(fix.statementEnd)), fix.replacement || '');
      if (!await vscode.workspace.applyEdit(edit)) vscode.window.showErrorMessage('IKEMaker could not apply the reviewed unused-local fixes. No source was changed.');
    }),
    vscode.languages.registerCodeActionsProvider({ language: 'zss', scheme: 'file' }, {
      provideCodeActions(document, range, contextValue) {
        if (!(contextValue.diagnostics || []).some(diagnostic => diagnostic.code === 'unused-let')) return [];
        const candidates = analyzeUnusedLets(document.getText()).issues.filter(issue => issue.code === 'unused-let' && issue.line >= range.start.line && issue.line <= range.end.line);
        const actions = candidates.flatMap(issue => {
          const spec = actionFor(issue); if (!spec) return [];
          const action = new vscode.CodeAction(spec.title, vscode.CodeActionKind.QuickFix);
          action.isPreferred = issue.fixKind === 'remove';
          action.diagnostics = (contextValue.diagnostics || []).filter(diagnostic => diagnostic.code === 'unused-let' && diagnostic.range.start.line === issue.line);
          action.command = { command, title: spec.title, arguments: [{ uri: document.uri.toString(), version: document.version, ...spec }] };
          return [action];
        });
        const allSafe = safeActions(document.getText());
        if (allSafe.length > 1) {
          const batch = new vscode.CodeAction(`Review ${allSafe.length} safe unused-local fixes in this file…`, vscode.CodeActionKind.QuickFix);
          batch.diagnostics = (contextValue.diagnostics || []).filter(diagnostic => diagnostic.code === 'unused-let');
          batch.command = { command: batchCommand, title: batch.title, arguments: [{ uri: document.uri.toString(), version: document.version }] };
          actions.push(batch);
        }
        return actions;
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })
  );
}

module.exports = { actionFor, safeActions, registerUnusedLetCodeActions };
