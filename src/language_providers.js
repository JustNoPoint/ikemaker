'use strict';

const triggerCatalog = require('../data/triggers.json');
const luaCatalog = require('../data/lua-api.json');
const { completionModels, hoverModel, luaCompletionModels, luaHoverModel } = require('./language_intelligence');

function domainFor(document) {
  if (document.languageId === 'lua') return 'lua';
  return document.languageId === 'ikemen-cns' ? 'cns' : 'zss';
}

function experienceFor(vscode, document) {
  return vscode.workspace.getConfiguration('ikemenZss', document.uri)
    .get(`experience.${domainFor(document)}`, 'learning');
}

function markdown(vscode, model) {
  const value = new vscode.MarkdownString(undefined, true);
  value.isTrusted = false;
  value.appendMarkdown(`### ${model.title}\n\n`);
  if (model.summary) value.appendMarkdown(`${model.summary}\n\n`);
  if (model.explanation) value.appendMarkdown(`**Learning note:** ${model.explanation}\n\n`);
  value.appendMarkdown('Bundled IKEMEN 1.0 documentation.');
  if (model.url) value.appendMarkdown(` [Official online reference](${model.url})`);
  return value;
}

function completionKind(vscode, kind) {
  if (kind === 'controller') return vscode.CompletionItemKind.Class;
  if (kind === 'parameter') return vscode.CompletionItemKind.Property;
  if (kind === 'redirection') return vscode.CompletionItemKind.Reference;
  if (kind === 'luaFunction') return vscode.CompletionItemKind.Function;
  return vscode.CompletionItemKind.Function;
}

function makeCompletion(vscode, model, index) {
  const item = new vscode.CompletionItem(model.label, completionKind(vscode, model.kind));
  item.detail = model.detail;
  item.documentation = model.documentation;
  item.insertText = new vscode.SnippetString(model.insertText);
  item.sortText = `${model.kind === 'parameter' ? '0' : model.kind === 'controller' ? '1' : '2'}-${String(index).padStart(4, '0')}-${model.label}`;
  return item;
}

function registerLanguageProviders(vscode, context, getControllers) {
  const selector = [{ language: 'zss' }, { language: 'ikemen-cns' }, { language: 'lua' }];
  const completions = {
    provideCompletionItems(document, position) {
      const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
      const models = document.languageId === 'lua' ? luaCompletionModels({
        linePrefix, experience: experienceFor(vscode, document), api: luaCatalog
      }) : completionModels({
        text: document.getText(), line: position.line, linePrefix,
        languageId: document.languageId, experience: experienceFor(vscode, document),
        controllers: getControllers(), triggers: triggerCatalog
      });
      return models.map((model, index) => makeCompletion(vscode, model, index));
    }
  };
  const hovers = {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_.]*/);
      if (!range) return undefined;
      const model = document.languageId === 'lua' ? luaHoverModel({
        word: document.getText(range), experience: experienceFor(vscode, document), api: luaCatalog
      }) : hoverModel({
        word: document.getText(range), text: document.getText(), line: position.line,
        languageId: document.languageId, experience: experienceFor(vscode, document),
        controllers: getControllers(), triggers: triggerCatalog
      });
      return model ? new vscode.Hover(markdown(vscode, model), range) : undefined;
    }
  };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, completions, ':', '=', '(', ','),
    vscode.languages.registerHoverProvider(selector, hovers)
  );
}

module.exports = { registerLanguageProviders, domainFor, experienceFor, markdown };
