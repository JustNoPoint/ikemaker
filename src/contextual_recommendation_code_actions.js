'use strict';

const catalog = require('./authoring_catalog');
const { contextualRecommendations } = require('./zss_context_recommendations');

function recommendationAt(document, line, options = {}, source = catalog) {
  if (!document || !Number.isInteger(line)) return null;
  const model = contextualRecommendations({
    text: document.getText(),
    line,
    favoriteIds: options.favoriteIds || [],
    recentIds: options.recentIds || [],
    intentAliases: options.intentAliases || {}
  }, source);
  if (!model.items.length) return null;
  return {
    query: model.query,
    count: model.items.length,
    reason: model.reasons[0] || 'The current code has matching reviewed catalog patterns.'
  };
}

function registerContextualRecommendationCodeActions(vscode, context, preferences = {}) {
  const provider = {
    provideCodeActions(document, range) {
      const mode = vscode.workspace.getConfiguration('ikemenZss', document.uri).get('contextualRecommendations.mode', 'manual');
      if (mode !== 'suggestions') return [];
      const line = range?.start?.line;
      const match = recommendationAt(document, line, {
        favoriteIds: preferences.favorites?.() || [],
        recentIds: preferences.recents?.() || [],
        intentAliases: vscode.workspace.getConfiguration('ikemenZss', document.uri).get('authoring.intentAliases', {})
      });
      if (!match) return [];
      const title = `IKEMaker: Review ${match.count} contextual suggestion${match.count === 1 ? '' : 's'}…`;
      const action = new vscode.CodeAction(title, vscode.CodeActionKind.Empty);
      action.command = { command: 'zss.contextualRecommendations', title };
      action.detail = `${match.reason} Nothing is inserted until you choose an item.`;
      return [action];
    }
  };
  const disposable = vscode.languages.registerCodeActionsProvider(
    { language: 'zss', scheme: 'file' },
    provider,
    { providedCodeActionKinds: [vscode.CodeActionKind.Empty] }
  );
  context.subscriptions.push(disposable);
  return disposable;
}

module.exports = { recommendationAt, registerContextualRecommendationCodeActions };
