'use strict';

const path = require('path');
const { normalized: normalizeView } = require('./authoring_view_state');
const { createNavigationState, projectNavigation } = require('./authoring_navigation_model');
const { normalizeRoute, unavailable } = require('./exact_source_routes');
const { deepFreeze } = require('./viewer_toolbar_contract');

const CODE_KINDS = Object.freeze(['zss', 'cns', 'st', 'lua', 'txt']);
const COMMAND_KINDS = Object.freeze(['cmd', 'inp', 'jnp', 'dat']);
const LAUNCH_KINDS = Object.freeze(['air', 'def']);

function snapshotOf(context) {
  return typeof context?.snapshot === 'function' ? context.snapshot() : deepFreeze({ ...(context || {}) });
}

function classifyDocument(document, options = {}) {
  const classifier = options.classify || require('./text_editor_toolbar').classify;
  return deepFreeze({ ...classifier(document, options.configuration) });
}

function documentText(document) { return String(document?.getText?.() ?? document?.text ?? ''); }
function documentFilename(document) { return String(document?.fileName || document?.uri?.fsPath || document?.uri?.path || ''); }

function sourceProjection(document, classification, options = {}) {
  const kind = classification?.kind || '';
  const filename = documentFilename(document), text = documentText(document);
  if (CODE_KINDS.includes(kind)) {
    const code = options.codeStructure || require('./code_structure_model');
    const language = kind === 'st' ? 'cns' : kind;
    const root = code.parseCodeStructure(text, language, filename);
    return deepFreeze({ kind: 'code-structure', editable: true, filename, text, root, items: code.flatten(root) });
  }
  if (COMMAND_KINDS.includes(kind)) {
    const commands = options.commandMovelist || require('./command_movelist_model');
    const parsed = commands.parseCommands(text, filename);
    return deepFreeze({ kind: 'command-movelist', editable: true, filename, text, document: parsed, commands: parsed.commands, movelists: commands.parseMovelistAssignments(text, filename) });
  }
  if (LAUNCH_KINDS.includes(kind)) {
    return deepFreeze({
      kind: 'launch-card', editable: true, filename, text,
      title: kind === 'air' ? 'Animation source' : `${classification.role || 'Project'} definition source`,
      message: 'Edit the complete source in this viewer’s Source or Split mode. The specialist visual workspace remains available here without creating a duplicate editor.',
      sourceDocument: { filename, uri: String(document?.uri?.toString?.() || filename), text, integratedEditor: true }
    });
  }
  return deepFreeze({ kind: 'unsupported', editable: false, filename });
}

function exactRoute(value, request = {}) {
  if (!value) return unavailable('No exact source route was supplied.', request);
  return normalizeRoute(value, request);
}

function openFullTextIntent(route, options = {}) {
  if (!route?.available) return deepFreeze({ type: 'open-full-text', available: false, reason: String(route?.reason || 'Exact source is unavailable.') });
  return deepFreeze({
    type: 'open-full-text', available: true, command: 'vscode.open',
    uri: String(options.uri || route.uri || route.filename), filename: route.filename,
    line: route.line, range: route.range, contextId: route.contextId,
    selectionRevision: route.selectionRevision, fingerprint: route.fingerprint, version: route.version
  });
}

function toolbarProjection(surfaceId, options = {}) {
  if (options.toolbarProjection) return options.toolbarProjection;
  if (!surfaceId) return deepFreeze({ contractId: '', surfaceId: '', slots: [] });
  const adapter = options.toolbarAdapter || require('./universal_toolbar_adapter');
  return adapter.adapt(surfaceId, options.toolbarCapabilities || {}, options.toolbarOptions || {});
}

function createAuthoringShellModel(options = {}) {
  const context = snapshotOf(options.context), surfaceId = String(options.surfaceId || context.activeSurfaceId || '');
  const classification = options.classification ? deepFreeze({ ...options.classification }) : classifyDocument(options.document, options);
  const view = options.viewState?.get ? options.viewState.get(context.identity || context.id, surfaceId) : normalizeView(options.view || options.presentation);
  const navigationState = options.navigation?.schema ? createNavigationState(options.navigation) : createNavigationState(options.navigation || { items: options.destinations || [] });
  const route = exactRoute(options.exactRoute, { contextId: context.identity || context.id, selectionRevision: context.selectionRevision, fingerprint: options.expectedFingerprint });
  return deepFreeze({
    schema: 'ikemaker.authoring-shell', version: 1, context, surfaceId, classification,
    presentation: view, navigation: projectNavigation(navigationState), toolbar: toolbarProjection(surfaceId, options),
    exactSource: route, source: classification.supported ? sourceProjection(options.document, classification, options) : deepFreeze({ kind: 'unsupported', editable: false, filename: documentFilename(options.document) }),
    openFullText: openFullTextIntent(route)
  });
}

module.exports = {
  CODE_KINDS, COMMAND_KINDS, LAUNCH_KINDS, classifyDocument, sourceProjection, exactRoute,
  openFullTextIntent, createAuthoringShellModel, composeAuthoringShell: createAuthoringShellModel
};
