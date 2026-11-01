'use strict';

const path = require('path');

function sourceEscapeActions(filename, routedLookup, directLookup) {
  if (!filename) return [];
  const route = routedLookup?.(filename) || null;
  const routed = Boolean(route && route.available !== false);
  const reopen = Boolean(route && !routed && route.origin);
  const direct = path.extname(filename).toLowerCase() === '.air' && Boolean(directLookup?.(filename));
  if (!routed && !direct && !reopen) return [];
  const line = routed && Number.isSafeInteger(route.line) && route.line >= 0 ? route.line : 0;
  if (reopen) return [{
    title: '↻ AIR',
    command: 'air.reopenActionsBrowser',
    tooltip: 'Reopen the exact AIR Actions Browser that opened this source.',
    line: Number.isSafeInteger(route.line) && route.line >= 0 ? route.line : 0
  }];
  const actions = [{
    title: '← AIR',
    command: 'air.focusActionsBrowser',
    tooltip: 'Return to the exact AIR Actions Browser; keep this source open.',
    line
  }];
  if (routed) actions.push({
    title: '× Source',
    command: 'air.closeSourceAndReturn',
    tooltip: 'Close only this routed source and return to its AIR Actions Browser.',
    line
  });
  return actions;
}

function registerAirSourceEscapeProvider(context, services = {}) {
  const vscode = services.vscode || require('vscode');
  const routedLookup = services.routedLookup || (() => null);
  const directLookup = services.directLookup || (() => false);
  const onDidChange = services.onDidChange;
  if (typeof vscode.languages?.registerCodeLensProvider !== 'function' || typeof vscode.CodeLens !== 'function') return { dispose() {} };

  const emitter = typeof vscode.EventEmitter === 'function' ? new vscode.EventEmitter() : null;
  const provider = {
    onDidChangeCodeLenses: emitter?.event,
    provideCodeLenses(document) {
      const filename = document?.uri?.scheme === 'file' ? document.fileName : '';
      const actions = sourceEscapeActions(filename, routedLookup, directLookup);
      if (!actions.length) return [];
      const anchor = Math.max(0, Math.min(Math.max(0, Number(document.lineCount || 1) - 1), actions[0].line));
      const line = document.lineCount > 0 ? document.lineAt(anchor) : null;
      const range = line?.range || new vscode.Range(anchor, 0, anchor, 0);
      return actions.map(action => new vscode.CodeLens(range, {
        title: action.title,
        command: action.command,
        tooltip: action.tooltip,
        arguments: [document.uri]
      }));
    }
  };
  const registration = vscode.languages.registerCodeLensProvider({ scheme: 'file' }, provider);
  const changeRegistration = typeof onDidChange === 'function' ? onDidChange(() => emitter?.fire()) : { dispose() {} };
  const disposable = {
    dispose() {
      changeRegistration?.dispose?.();
      registration?.dispose?.();
      emitter?.dispose?.();
    }
  };
  context?.subscriptions?.push(disposable);
  return disposable;
}

module.exports = { sourceEscapeActions, registerAirSourceEscapeProvider };
