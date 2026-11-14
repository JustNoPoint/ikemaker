'use strict';

function debugFloodProblems(text, languageId) {
  return [
    ...require('./redirect_guard_diagnostics').redirectProblems(text,languageId),
    ...require('./integer_var_diagnostics').integerVarProblems(text,languageId)
  ];
}

function registerDebugFloodFixes(vscode, context, isAssignedText) {
  const language = doc => isAssignedText(doc) ? 'ikemen-cns' : doc?.languageId;
  const supported = lang => lang === 'ikemen-cns' || lang === 'zss';
  const command = 'ikemen.diagnostics.fixDebugFlood';
  const selector = [{language:'ikemen-cns'}, {language:'zss'}, {language:'plaintext',pattern:'**/*.[tT][xX][tT]'}];
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, {
    provideCodeActions(doc,range,request) {
      if (!supported(language(doc)) || !request.diagnostics.some(d => d.code === 'redirect-guard' || d.code === 'integer-var-fractional-write')) return [];
      const actions = [];
      for (const {diagnostic, fixes} of debugFloodProblems(doc.getText(),language(doc))) {
        const {code,line,start} = diagnostic;
        const item = request.diagnostics.find(d => d.code === code && d.range.start.line === line && d.range.start.character === start);
        if (!item) continue;
        for (const {title} of fixes) {
          const action = new vscode.CodeAction(title,vscode.CodeActionKind.QuickFix);
          action.diagnostics = [item];
          action.command = {command,title,arguments:[doc.uri.toString(),doc.version,code,line,start,title]};
          actions.push(action);
        }
      }
      return actions;
    }
  }, {providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}), vscode.commands.registerCommand(command, async (uri,version,code,line,start,title) => {
    const editor = vscode.window.activeTextEditor, doc = editor?.document;
    if (!doc || !supported(language(doc)) || doc.uri.toString() !== uri || doc.version !== version) {
      return vscode.window.showInformationMessage('Source changed. Open Quick Fix again on the current warning.');
    }
    const problem = debugFloodProblems(doc.getText(),language(doc)).find(({diagnostic:d}) => d.code === code && d.line === line && d.start === start);
    const fix = problem?.fixes.find(f=>f.title === title);
    if (fix) return editor.edit(builder => {
      for (const edit of fix.changes) builder.replace(new vscode.Range(edit.line,edit.start,edit.line,edit.start+edit.length),edit.text);
    });
  }));
}
module.exports = {debugFloodProblems,registerDebugFloodFixes};
