'use strict';

const fs = require('fs');
const { auditAnimationStandards, resolveStandards } = require('./animation_standards');
const { parseAir } = require('./air_preview_model');
const { readSff } = require('./sff_reader');
const { inferCharacterFiles } = require('./character_asset_resolver');

const archiveCache = new Map();
const ALLOW_MISSING_SFF = 'IKEMAKER: ALLOW MISSING SFF';

function missingSpriteReferences(airText, archive) {
  const lines = String(airText || '').split(/\r?\n/), ignoredActions = new Set();
  let pendingIgnore = false;
  for (const line of lines) {
    if (new RegExp(ALLOW_MISSING_SFF, 'i').test(line) && /^\s*[;#]/.test(line)) pendingIgnore = true;
    const heading = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*$/i.exec(line);
    if (heading) { if (pendingIgnore) ignoredActions.add(Number(heading[1])); pendingIgnore = false; }
    else if (line.trim() && !/^\s*[;#]/.test(line)) pendingIgnore = false;
  }
  const sprites = new Set((archive?.sprites || []).map((sprite) => `${sprite.group},${sprite.number}`));
  const missing = [];
  for (const action of parseAir(airText)) for (let index = 0; index < action.frames.length; index += 1) {
    const frame = action.frames[index], key = `${frame.group},${frame.index}`;
    const sourceLine = lines[Math.max(0, Number(frame.line || 1) - 1)] || '';
    if (frame.group >= 0 && frame.index >= 0 && !sprites.has(key) && !ignoredActions.has(action.number) && !new RegExp(ALLOW_MISSING_SFF, 'i').test(sourceLine)) missing.push({ action: action.number, element: index + 1, line: frame.line, key, group: frame.group, index: frame.index, time: frame.time });
  }
  return missing;
}

function actionHeadingLine(document, fromLine) {
  for (let line = Math.max(0, fromLine); line >= 0; line -= 1) if (/^\s*\[\s*begin\s+action\s+-?\d+\s*\]\s*$/i.test(document.lineAt(line).text)) return line;
  return null;
}

function literalAnimationReferences(texts) {
  const references = new Set();
  for (const source of Array.isArray(texts) ? texts : [texts]) {
    const text = String(source || ''), clean = text.split(/\r?\n/).map((line) => /^\s*[;#]/.test(line) ? '' : line.replace(/\s+#.*$/, '')).join('\n');
    for (const match of clean.matchAll(/\b(?:anim|animation|actionno|projanim|projhitanim|projremanim|projcancelanim)\s*[:=]\s*(-?\d+)\b/gi)) references.add(Number(match[1]));
    for (const block of clean.split(/(?=^\s*\[)/gm)) {
      if (!/^\s*\[[^\]]+\][\s\S]*?^\s*type\s*=\s*changeanim2?\b/im.test(block)) continue;
      const value = /^\s*value\s*=\s*(-?\d+)\b/im.exec(block);
      if (value) references.add(Number(value[1]));
    }
    for (const match of clean.matchAll(/\bchangeanim2?\s*\{[\s\S]*?\bvalue\s*:\s*(-?\d+)\b/gi)) references.add(Number(match[1]));
  }
  return references;
}

function archivedActions(airText) {
  const lines = String(airText || '').split(/\r?\n/), archived = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]\s*$/i.exec(lines[index]);
    if (!heading) continue;
    const nearby = lines.slice(Math.max(0, index - 5), index).join('\n');
    if (/(?:@archive\b|ikemaker\s*:\s*archiv(?:e|ed)\b|\barchived\s+air\b|\blegacy\s+retained\b)/i.test(nearby)) archived.add(Number(heading[1]));
  }
  return archived;
}

function classifyMissingSpriteReferences(missing, options = {}) {
  const required = new Set((options.requiredAnimations || []).map((item) => Number(item.action ?? item)));
  const recommended = new Set((options.recommendedAnimations || []).map((item) => Number(item.action ?? item)));
  const runtime = options.runtimeAnimations instanceof Set ? options.runtimeAnimations : new Set(options.runtimeAnimations || []);
  const archived = options.archivedAnimations instanceof Set ? options.archivedAnimations : new Set(options.archivedAnimations || []);
  const result = { required: [], runtime: [], legacy: [], archived: [] };
  for (const item of missing || []) {
    if (required.has(item.action)) result.required.push(item);
    else if (recommended.has(item.action) || runtime.has(item.action)) result.runtime.push(item);
    else if (archived.has(item.action)) result.archived.push(item);
    else result.legacy.push(item);
  }
  return result;
}

function cachedArchive(filename) {
  const stat = fs.statSync(filename), signature = `${stat.size}:${stat.mtimeMs}`, cached = archiveCache.get(filename);
  if (cached?.signature === signature) return cached.archive;
  const archive = readSff(filename); archiveCache.set(filename, { signature, archive }); return archive;
}

function configuredSets(vscode, uri) {
  return vscode.workspace.getConfiguration('ikemenZss', uri)
    .get('animationStandardSets', ['ikemen-1.0-character-core']);
}

function registerAnimationStandardDiagnostics(vscode, context) {
  const collection = vscode.languages.createDiagnosticCollection('ikemen-animation-standards');
  let timer;
  const update = (document) => {
    if (!document || document.languageId !== 'ikemen-air') return;
    const config = vscode.workspace.getConfiguration('ikemenZss', document.uri);
    if (!config.get('animationStandardDiagnostics', true)) return collection.delete(document.uri);
    const audit = auditAnimationStandards(document.getText(), configuredSets(vscode, document.uri));
    const diagnostics = audit.sets.map((set) => {
      const required = new Set((set.requiredAnimations || []).map((entry) => Number(entry.action)));
      const missing = audit.missingAnimations.filter((entry) => required.has(Number(entry.action)));
      if (!missing.length) return null;
      const range = new vscode.Range(0, 0, 0, Math.min(document.lineAt(0).text.length, 1));
      const detail = missing.map((entry) => `${entry.action} ${entry.label}`).join(', ');
      const diagnostic = new vscode.Diagnostic(range, `${set.label}: missing ${missing.length} required action(s): ${detail}`, vscode.DiagnosticSeverity.Warning);
      diagnostic.source = 'IKEMEN Animation Standards';
      diagnostic.code = 'missing-standard-animations';
      return diagnostic;
    }).filter(Boolean);
    try {
      const assets = inferCharacterFiles(document.fileName);
      if (assets?.sffPath && fs.existsSync(assets.sffPath)) {
        const missing = missingSpriteReferences(document.getText(), cachedArchive(assets.sffPath));
        if (missing.length) {
          const standards = resolveStandards(configuredSets(vscode, document.uri));
          const sourceTexts = (assets.sourcePaths || []).map((filename) => { try { return fs.readFileSync(filename, 'utf8'); } catch (_) { return ''; } });
          const classified = classifyMissingSpriteReferences(missing, {
            requiredAnimations: standards.requiredAnimations,
            recommendedAnimations: standards.recommendedAnimations,
            runtimeAnimations: literalAnimationReferences(sourceTexts),
            archivedAnimations: archivedActions(document.getText())
          });
          for (const item of classified.required) {
            const line = Math.max(0, Math.min(document.lineCount - 1, item.line - 1)), text = document.lineAt(line).text;
            const diagnostic = new vscode.Diagnostic(new vscode.Range(line, 0, line, text.length), `Required Action ${item.action}, element ${item.element} references missing sprite ${item.key} for ${item.time} tick(s). The AIR remains valid; restore the SFF sprite or dismiss this warning if the omission is intentional.`, vscode.DiagnosticSeverity.Warning);
            diagnostic.source = 'IKEMEN AIR/SFF Sync'; diagnostic.code = 'air-missing-sff-sprite'; diagnostics.push(diagnostic);
          }
          const runtimeByAction = new Map();
          for (const item of classified.runtime) if (!runtimeByAction.has(item.action)) runtimeByAction.set(item.action, []);
          for (const item of classified.runtime) runtimeByAction.get(item.action).push(item);
          for (const [action, items] of runtimeByAction) {
            const first = items[0], line = Math.max(0, Math.min(document.lineCount - 1, first.line - 1)), text = document.lineAt(line).text;
            const diagnostic = new vscode.Diagnostic(new vscode.Range(line, 0, line, text.length), `Runtime/recommended Action ${action} has ${items.length} AIR frame reference(s) to missing SFF sprites (for example ${first.key}). Review the calling code or restore the sprite.`, vscode.DiagnosticSeverity.Warning);
            diagnostic.source = 'IKEMEN AIR/SFF Sync'; diagnostic.code = 'air-runtime-missing-sff-sprite'; diagnostics.push(diagnostic);
          }
          if (config.get('airLegacyReferenceDiagnostics', false) && (classified.legacy.length || classified.archived.length)) {
            const actions = new Set([...classified.legacy, ...classified.archived].map((item) => item.action)), range = new vscode.Range(0, 0, 0, Math.min(document.lineAt(0).text.length, 1));
            const diagnostic = new vscode.Diagnostic(range, `${classified.legacy.length} unreferenced legacy and ${classified.archived.length} explicitly archived AIR frame reference(s) use absent SFF sprites across ${actions.size} action(s). These optional retained-AIR notices are hidden by default.`, vscode.DiagnosticSeverity.Information);
            diagnostic.source = 'IKEMEN AIR/SFF Sync'; diagnostic.code = 'air-legacy-missing-sff-sprite'; diagnostics.push(diagnostic);
          }
        }
      }
    } catch (_) {
      // A malformed or temporarily unavailable SFF must not suppress AIR editing.
    }
    collection.set(document.uri, diagnostics);
  };
  const schedule = (document) => { clearTimeout(timer); timer = setTimeout(() => update(document), 300); };
  context.subscriptions.push(
    collection,
    vscode.languages.registerCodeActionsProvider({ language: 'ikemen-air' }, {
      provideCodeActions(document, _range, codeActionContext) {
        const relevant = codeActionContext.diagnostics.filter((item) => ['air-missing-sff-sprite', 'air-runtime-missing-sff-sprite'].includes(String(item.code || '')));
        if (!relevant.length) return [];
        const line = relevant[0].range.start.line, text = document.lineAt(line).text;
        const one = new vscode.CodeAction('Dismiss this missing-SFF frame warning', vscode.CodeActionKind.QuickFix);
        one.diagnostics = relevant; one.isPreferred = true; one.edit = new vscode.WorkspaceEdit();
        one.edit.replace(document.uri, document.lineAt(line).range, `${text} ; ${ALLOW_MISSING_SFF}`);
        const heading = actionHeadingLine(document, line), actions = [one];
        if (heading !== null) {
          const all = new vscode.CodeAction('Dismiss missing-SFF warnings for this AIR action', vscode.CodeActionKind.QuickFix);
          all.diagnostics = relevant; all.edit = new vscode.WorkspaceEdit();
          all.edit.insert(document.uri, new vscode.Position(heading, 0), `; ${ALLOW_MISSING_SFF}\n`); actions.push(all);
        }
        return actions;
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidSaveTextDocument(update),
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('ikemenZss.animationStandard')) {
        for (const document of vscode.workspace.textDocuments) update(document);
      }
    })
  );
  for (const document of vscode.workspace.textDocuments) update(document);
}

module.exports = { ALLOW_MISSING_SFF, missingSpriteReferences, literalAnimationReferences, archivedActions, classifyMissingSpriteReferences, registerAnimationStandardDiagnostics };
