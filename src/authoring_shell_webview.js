'use strict';

const { projectNavigation, resolveDestinationKey, handleDestinationKey, applyDestinationVisibility } = require('./authoring_navigation_model');
const { clientScript: closeClientScript } = require('./viewer_close');
const { universalToolbarStyle, renderUniversalToolbar, universalToolbarClientScript } = require('./universal_toolbar_webview');
const viewerToolbar = require('./viewer_toolbar');
const { HAND_ID_PATTERN } = require('./authoring_card_hands');
const { statusTokens, summarizeHand } = require('./authoring_destination_status');

const VIEW_MODES = Object.freeze(['visual', 'source', 'split']);
const CODE_NAVIGATION_MODES = Object.freeze(['tabs', 'cards']);
const MESSAGE_TYPES = Object.freeze([
  'set-view-mode', 'open-full-text', 'set-navigation-mode',
  'select-navigation', 'activate-navigation', 'previous-navigation', 'next-navigation', 'organize-navigation', 'toggle-navigation-hand', 'edit-source', 'remember-source-view', 'launch-visual'
]);
const VISUAL_ROUTES = Object.freeze({
  'air:*': Object.freeze({ command:'air.openAnimationPreview', label:'Open AIR Animation Preview' }),
  'def:stage': Object.freeze({ command:'ikemen.stage.openWorkspace', label:'Open Stage Workspace' }),
  'def:screenpack': Object.freeze({ command:'ikemen.ui.openWorkspace', label:'Open Screenpack Workspace' }),
  'def:roster': Object.freeze({ command:'ikemen.selectDef.openWorkspace', label:'Open Roster Manager' }),
  'def:character': Object.freeze({ command:'ikemen.characterDependencies.open', label:'Open Character Dependencies' })
});
const AUTHORING_SHELL_CSS = `
  *{box-sizing:border-box}
  html{max-width:100%;scroll-behavior:auto}
  body{max-width:100%;margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}
  button,input{font:inherit}
  button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  .ikemaker-universal-toolbar{max-width:100%;min-width:0;flex-wrap:wrap;overflow-x:visible}
  .ikemaker-universal-toolbar__group{max-width:100%;min-width:0;flex-wrap:wrap}
  .authoring-toolbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:2px;max-width:100%;padding:2px 3px;border-bottom:1px solid var(--vscode-panel-border);overflow:visible}
  .authoring-toolbar .launch-controls,.authoring-toolbar .viewer-dropdown-toolbar,.authoring-toolbar .viewer-icon-toolbar,.authoring-toolbar .viewer-icon-row,.authoring-toolbar .viewer-toolbar-options,.authoring-toolbar .viewer-action-favorites-bar{display:flex;flex-wrap:wrap;align-items:center;gap:3px;max-width:100%;min-width:0;overflow:visible}
  .authoring-toolbar .viewer-dropdown>div{z-index:10050}
  .shell-controls,.slider-row{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;flex-wrap:wrap;padding:6px}
  .shell-controls>*{max-width:100%}
  .view-switch,.presentation-switch{display:flex;min-width:0;max-width:100%;flex-wrap:wrap;gap:2px;padding:5px 6px 0}
  .open-full-text{font-weight:600}
  .conflict{min-width:0;margin:0;padding:7px 10px;overflow-wrap:anywhere;color:var(--vscode-inputValidation-warningForeground);background:var(--vscode-inputValidation-warningBackground);border-block:1px solid var(--vscode-inputValidation-warningBorder)}
  .navigator{min-width:0;max-width:100%;border-top:1px solid var(--vscode-panel-border)}
  .destination-strip{display:grid;grid-template-columns:27px minmax(0,1fr) 27px;align-items:start;gap:4px;min-width:0;max-width:100%;padding:5px 6px 2px}
  .nav-arrow{box-sizing:border-box;width:27px;min-width:27px;max-width:27px;height:27px;min-height:27px;max-height:27px;padding:0}
  .slider-row{flex-wrap:nowrap;padding-top:2px}
  #destination-slider{width:min(320px,100%);min-width:60px;max-width:100%;flex:1 1 120px}
  #destination-position{min-width:0;max-width:50%;flex:0 1 auto;white-space:normal;overflow-wrap:anywhere}
  .destination-tabs,.destination-cards{display:flex;gap:3px;min-width:0;max-width:100%;flex-wrap:wrap;overflow:hidden}
  .destination-tabs button{min-width:0;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .destination-cards{align-items:flex-start;gap:8px}
  .destination-card-group{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;flex-wrap:wrap;padding:3px 5px;background:var(--vscode-sideBar-background,var(--vscode-editor-background));border:1px solid var(--vscode-panel-border)}
  .destination-card-group h3{min-width:0;max-width:100%;margin:0 4px 0 0;font-size:11px;overflow-wrap:anywhere;color:var(--vscode-descriptionForeground)}
  .destination-card-group .destination-hand-toggle{max-width:100%;min-height:22px;margin:0;padding:2px 5px;overflow-wrap:anywhere;white-space:normal;box-shadow:none}
  .destination-card-group>div{display:flex;align-items:center;min-width:0;max-width:100%;flex-wrap:wrap;padding-left:7px}
  .destination-card-group button{position:relative;min-width:0;max-width:112px;min-height:26px;margin-left:-7px;padding:3px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--vscode-editor-background);box-shadow:-2px 0 0 var(--vscode-panel-border)}
  .destination-card-group button[aria-current="page"]{z-index:2;outline:1px solid var(--vscode-focusBorder)}
  .destination-status-chip{display:inline-block;max-width:100%;margin-left:4px;padding:1px 3px;border:1px solid var(--vscode-panel-border);font-size:10px;line-height:1.2;white-space:normal;overflow-wrap:anywhere}
  .destination-hand-summary{display:block;color:var(--vscode-descriptionForeground);font-size:10px;font-weight:400}
  #authoring-content{display:grid;min-width:0;max-width:100%;min-height:40vh}
  #authoring-content[data-view-mode="split"]{grid-template-columns:minmax(220px,1fr) minmax(260px,1fr)}
  #authoring-content[data-view-mode="visual"] #source-pane,#authoring-content[data-view-mode="source"] #visual-pane{display:none}
  #visual-pane,#source-pane,.source-status{min-width:0;max-width:100%;overflow-wrap:anywhere}
  #visual-pane{display:block;padding:8px;overflow:auto}
  #visual-pane>button,#visual-pane>.code-leaf{margin:3px}
  .code-branch{min-width:0;margin:3px;padding:3px 3px 3px 8px;overflow-wrap:anywhere;border-left:2px solid var(--vscode-panel-border)}
  .code-branch summary{cursor:pointer}
  .code-branch-actions{margin:4px 0}
  .code-children{min-width:0;margin-left:10px}
  .code-leaf{min-width:0;overflow-wrap:anywhere}
  .code-leaf button{width:100%;max-width:100%;text-align:left;overflow-wrap:anywhere}
  #source-pane{border-left:1px solid var(--vscode-panel-border)}
  #source-editor{display:block;width:100%;max-width:100%;min-height:56vh;resize:vertical;overflow:auto;border:0;padding:10px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font:var(--vscode-editor-font-size) var(--vscode-editor-font-family);tab-size:4}
  .source-status{margin:0;padding:4px 10px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);font-size:12px}
  @media(max-width:400px){
    #authoring-content[data-view-mode="split"]{grid-template-columns:minmax(0,1fr)}
    #authoring-content[data-view-mode="split"] #source-pane{border-top:1px solid var(--vscode-panel-border);border-left:0}
    .shell-controls,.view-switch,.presentation-switch{align-items:center;flex-wrap:wrap}
    .slider-row{align-items:stretch;flex-wrap:wrap}
    #destination-slider{width:100%;flex:1 1 100%}
    #destination-position{width:100%;max-width:100%}
    .destination-card-group,.destination-card-group>div{width:100%}
  }
  @media(forced-colors:active){
    body{color:CanvasText;background:Canvas}
    .ikemaker-universal-toolbar,.ikemaker-universal-toolbar__group,.authoring-toolbar,.navigator,.destination-card-group,#source-pane,.source-status,.conflict,.code-branch{border-color:CanvasText!important}
    button,input,textarea,.destination-card-group,.source-status,.destination-status-chip,.destination-hand-summary{color:ButtonText!important;background:ButtonFace!important;border-color:ButtonText!important}
    button:focus-visible,input:focus-visible,textarea:focus-visible{outline-color:Highlight!important}
    button[aria-selected="true"],button[aria-current="page"],button[aria-pressed="true"]{color:HighlightText!important;background:Highlight!important;border-color:Highlight!important;outline-color:Highlight!important}
    .authoring-toolbar .viewer-icon-row button{color:ButtonText!important;background:ButtonFace!important;border-color:ButtonText!important}
    .authoring-toolbar .viewer-icon-row button:focus-visible{outline-color:Highlight!important}
    .authoring-toolbar .viewer-icon-row button:is(:active,[aria-selected="true"],[aria-current="page"],[aria-pressed="true"]){color:HighlightText!important;background:Highlight!important;border-color:Highlight!important;outline-color:Highlight!important}
    .conflict{color:CanvasText!important;background:Canvas!important;border-color:Highlight!important}
    .source-status{color:CanvasText!important;background:Canvas!important;border-color:CanvasText!important}
    #source-editor{color:CanvasText!important;background:Canvas!important}
  }
`;
const messageTypes = new Set(MESSAGE_TYPES);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function navigationProjection(navigation) {
  if (!navigation) return { mode: 'tabs', visibleItems: [], currentId: null, slider: { min: 0, max: 0, value: 0, title: '0 of 0', previousDisabled: true, nextDisabled: true } };
  if (navigation.slider && Array.isArray(navigation.visibleItems)) return navigation;
  return projectNavigation(navigation);
}

function visualLaunchRoute(model = {}) {
  const kind = String(model.classification?.kind || '').toLowerCase();
  const role = String(model.classification?.role || 'character').toLowerCase();
  const definition = VISUAL_ROUTES[`${kind}:${role}`] || VISUAL_ROUTES[`${kind}:*`];
  const filename = model.source?.filename || model.source?.sourceDocument?.filename || model.exactSource?.filename || '';
  if (!definition || typeof filename !== 'string' || !filename.trim()) return null;
  return Object.freeze({ type:'launch-visual', command:definition.command, label:definition.label, filename:filename.trim(), kind, role });
}

function validatedLaunchIntent(message) {
  if (!plainExact(message, ['type','command','filename','kind','role']) || message.type !== 'launch-visual') return null;
  const kind = String(message.kind || '').toLowerCase(), role = String(message.role || 'character').toLowerCase();
  const definition = VISUAL_ROUTES[`${kind}:${role}`] || VISUAL_ROUTES[`${kind}:*`];
  if (!definition || message.command !== definition.command || typeof message.filename !== 'string' || !message.filename.trim()) return null;
  return Object.freeze({ type:'launch-visual', command:definition.command, filename:message.filename.trim(), kind, role });
}

function plainExact(value, keys) {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validatedAuthoringShellMessage(message) {
  if (!message || typeof message !== 'object' || !messageTypes.has(message.type)) return null;
  if (message.type === 'set-view-mode') return plainExact(message, ['type','mode']) && VIEW_MODES.includes(message.mode) ? Object.freeze({ type:message.type, mode:message.mode }) : null;
  if (message.type === 'set-navigation-mode') return plainExact(message, ['type','mode']) && CODE_NAVIGATION_MODES.includes(message.mode) ? Object.freeze({ type:message.type, mode:message.mode }) : null;
  if (message.type === 'organize-navigation') return plainExact(message, ['type']) ? Object.freeze({ type:message.type }) : null;
  if (message.type === 'toggle-navigation-hand') return plainExact(message, ['type','id']) && typeof message.id === 'string' && HAND_ID_PATTERN.test(message.id) ? Object.freeze({ type:message.type, id:message.id }) : null;
  if (message.type === 'previous-navigation' || message.type === 'next-navigation') return plainExact(message, ['type']) ? Object.freeze({ type:message.type }) : null;
  if (message.type === 'select-navigation' || message.type === 'activate-navigation') {
    if (plainExact(message, ['type','id']) && typeof message.id === 'string' && message.id.length > 0 && Buffer.byteLength(message.id, 'utf8') <= 4096) return Object.freeze({ type:message.type, id:message.id });
    if (plainExact(message, ['type','index']) && Number.isSafeInteger(message.index) && message.index >= 0 && message.index < 512) return Object.freeze({ type:message.type, index:message.index });
    return null;
  }
  if (message.type === 'open-full-text') {
    if (plainExact(message, ['type'])) return Object.freeze({ type:message.type });
    return plainExact(message, ['type','line']) && Number.isSafeInteger(message.line) && message.line >= 0 && message.line < 10000000 ? Object.freeze({ type:message.type, line:message.line }) : null;
  }
  if (message.type === 'edit-source') {
    return plainExact(message, ['type','text','revision','generation']) && typeof message.text === 'string' && Buffer.byteLength(message.text, 'utf8') <= 4 * 1024 * 1024 && Number.isSafeInteger(message.revision) && message.revision > 0 && Number.isSafeInteger(message.generation) && message.generation > 0
      ? Object.freeze({ type:message.type, text:message.text, revision:message.revision, generation:message.generation }) : null;
  }
  if (message.type === 'remember-source-view') {
    return plainExact(message, ['type','generation','documentId','selectionStart','selectionEnd','selectionDirection','scrollTop','scrollLeft','focused']) &&
      Number.isSafeInteger(message.generation) && message.generation > 0 &&
      typeof message.documentId === 'string' && message.documentId.length > 0 && Buffer.byteLength(message.documentId, 'utf8') <= 8192 &&
      Number.isSafeInteger(message.selectionStart) && message.selectionStart >= 0 && message.selectionStart <= 4 * 1024 * 1024 &&
      Number.isSafeInteger(message.selectionEnd) && message.selectionEnd >= message.selectionStart && message.selectionEnd <= 4 * 1024 * 1024 &&
      ['forward','backward','none'].includes(message.selectionDirection) &&
      Number.isSafeInteger(message.scrollTop) && message.scrollTop >= 0 && message.scrollTop <= 10000000 &&
      Number.isSafeInteger(message.scrollLeft) && message.scrollLeft >= 0 && message.scrollLeft <= 10000000 &&
      typeof message.focused === 'boolean'
      ? Object.freeze({ type:message.type, generation:message.generation, documentId:message.documentId, selectionStart:message.selectionStart, selectionEnd:message.selectionEnd, selectionDirection:message.selectionDirection, scrollTop:message.scrollTop, scrollLeft:message.scrollLeft, focused:message.focused }) : null;
  }
  return validatedLaunchIntent(message);
}

function button(label, attributes = '') {
  return `<button type="button" ${attributes}>${escapeHtml(label)}</button>`;
}

function renderNavigation(projection, announcement = '') {
  const mode = projection.mode === 'cards' ? 'cards' : 'tabs';
  const slider = projection.slider;
  const options = projection.visibleItems.map((item, index) => `<option value="${index + 1}" label="${escapeHtml(item.title || item.label || item.id)}"></option>`).join('');
  const destinationButton = (item, index) => {
    const selected = item.id === projection.currentId;
    const semantics = mode === 'tabs' ? `role="tab" aria-selected="${selected}" aria-controls="source-pane"` : `aria-current="${selected ? 'page' : 'false'}"`;
    const tokens=statusTokens(item.status),filename=item.filename||item.title||item.label||item.id,complete=tokens.length?`${filename} · ${tokens.join(' · ')}`:filename,chip=tokens.length?`<span class="destination-status-chip">${escapeHtml(tokens.join(' · '))}</span>`:'';
    return `<button type="button" id="authoring-destination-${index}" ${semantics} tabindex="${selected ? '0' : '-1'}" data-nav-destination="true" data-message="select-navigation" data-id="${escapeHtml(item.id)}" title="${escapeHtml(complete)}" aria-label="${escapeHtml(complete)}">${escapeHtml(item.title || item.label || item.id)}${chip}</button>`;
  };
  const destinations = projection.visibleItems.map(destinationButton).join('');
  const indexById = new Map(projection.visibleItems.map((item, index) => [item.id, index]));
  const byId = new Map(projection.visibleItems.map((item) => [item.id, item]));
  const cardGroups = (projection.groups || []).filter((group) => group.itemIds.length || group.type === 'custom').map((group, groupIndex) => {
    const contentId=`destination-hand-${groupIndex}`, headingId=`destination-group-${groupIndex}`, expanded=group.expanded !== false;
    const summary=summarizeHand(group.itemIds,byId),summaryHtml=`<span class="destination-hand-summary">${escapeHtml(summary.text)}</span>`;
    const heading=group.type==='custom'?`<button type="button" class="destination-hand-toggle" data-message="toggle-navigation-hand" data-hand-id="${escapeHtml(group.id)}" aria-expanded="${expanded}" aria-controls="${contentId}">${escapeHtml(group.label)}${summaryHtml}</button>`:`${escapeHtml(group.label)}${summaryHtml}`;
    return `<section class="destination-card-group" role="group" aria-labelledby="${headingId}"><h3 id="${headingId}">${heading}</h3><div id="${contentId}">${expanded ? group.itemIds.map((id) => byId.has(id) ? destinationButton(byId.get(id), indexById.get(id)) : '').join('') : ''}</div></section>`;
  }).join('');
  const destinationBody = mode === 'cards' ? cardGroups : destinations;
  return `<section class="navigator" aria-label="Authoring destinations">
    <div class="presentation-switch" role="group" aria-label="Destination presentation">${['tabs','cards'].map((choice) => button(choice === 'tabs' ? 'Tabs' : 'Cards', `data-message="set-navigation-mode" data-mode="${choice}" aria-pressed="${mode === choice}"`)).join('')}${button('Organize tabs…','data-message="organize-navigation"')}</div>
    <div class="destination-strip">
      ${button('◀', `class="nav-arrow" data-message="previous-navigation" title="Previous tab" aria-label="Previous authoring destination" ${slider.previousDisabled ? 'disabled aria-disabled="true"' : ''}`)}
      <div class="destination-${escapeHtml(mode)}" ${mode === 'tabs' ? 'role="tablist"' : 'role="navigation"'} aria-label="Authoring destination list">${destinationBody}</div>
      ${button('▶', `class="nav-arrow" data-message="next-navigation" title="Next tab" aria-label="Next authoring destination" ${slider.nextDisabled ? 'disabled aria-disabled="true"' : ''}`)}
    </div>
    <div class="slider-row">
      <input id="destination-slider" data-message="select-navigation" aria-label="Select authoring destination" type="range" min="${slider.min}" max="${slider.max}" value="${slider.value}" step="1" list="destination-names" ${slider.max === 0 ? 'disabled' : ''}>
      <datalist id="destination-names">${options}</datalist>
      <output id="destination-position" for="destination-slider" aria-live="polite">${escapeHtml(announcement ? `${slider.title} · ${announcement}` : slider.title)}</output>
    </div>
  </section>`;
}

function renderCodeNode(item, depth = 0) {
  const label = `${item.kind || 'code'} · ${item.title || 'Untitled'}`;
  const open = `<button type="button" data-message="open-full-text" data-line="${Number(item.startLine || 0)}" aria-label="Open ${escapeHtml(label)} in full text">${escapeHtml(label)}</button>`;
  if (!item.children?.length) return `<div class="code-leaf depth-${Math.min(depth, 6)}">${open}</div>`;
  return `<details class="code-branch depth-${Math.min(depth, 6)}" ${depth === 0 ? 'open' : ''}><summary>${escapeHtml(label)}</summary><div class="code-branch-actions">${open}</div><div class="code-children">${item.children.map((child) => renderCodeNode(child, depth + 1)).join('')}</div></details>`;
}

function renderAuthoringShellHtml(model = {}, options = {}) {
  const toolbar = model.toolbar || model.universalToolbar;
  const projection = navigationProjection(model.navigation);
  const controlledBy = projection.mode === 'tabs' ? projection.visibleItems.findIndex((item) => item.id === projection.currentId) : -1;
  const viewMode = VIEW_MODES.includes(model.viewMode) ? model.viewMode : 'visual';
  const nonce = escapeHtml(options.nonce || 'authoring-shell');
  const cspSource = escapeHtml(options.cspSource || '');
  const persistedState = JSON.stringify(options.state || {}).replace(/</g, '\\u003c');
  const sourceView = options.sourceView && typeof options.sourceView === 'object' ? options.sourceView : {};
  const sourceDocumentId = JSON.stringify(String(options.documentId || '')).replace(/</g, '\\u003c');
  const revealNavigationId = JSON.stringify(String(options.revealNavigationId || '')).replace(/</g, '\\u003c');
  const focusNavigationId = JSON.stringify(String(options.focusNavigationId || '')).replace(/</g, '\\u003c');
  const canonicalNavigationIds = JSON.stringify(projection.visibleItems.map((item) => item.id)).replace(/</g, '\\u003c');
  const restoredSourceView = JSON.stringify({
    selectionStart: Math.max(0, Number(sourceView.selectionStart) || 0), selectionEnd: Math.max(0, Number(sourceView.selectionEnd) || 0), selectionDirection:['forward','backward','none'].includes(sourceView.selectionDirection) ? sourceView.selectionDirection : 'none',
    scrollTop: Math.max(0, Number(sourceView.scrollTop) || 0), scrollLeft: Math.max(0, Number(sourceView.scrollLeft) || 0), focused: sourceView.focused === true
  }).replace(/</g, '\\u003c');
  const source = model.source || {}, draft = model.draft || {}, sourceText = draft.text ?? source.text ?? source.sourceDocument?.text ?? '';
  const largeSource = Buffer.byteLength(String(sourceText), 'utf8') > 4 * 1024 * 1024;
  const editable = source.editable === true && draft.available !== false && !largeSource;
  const launchRoute = visualLaunchRoute(model);
  const launchCard = launchRoute ? `<article class="launch-card" data-launch-kind="${escapeHtml(launchRoute.kind)}" data-launch-role="${escapeHtml(launchRoute.role)}"><h2>${escapeHtml(source.title || 'Visual workspace')}</h2><p>${escapeHtml(source.message || 'Open the existing visual owner for this source.')}</p><button type="button" data-message="launch-visual" data-route-command="${escapeHtml(launchRoute.command)}" data-filename="${escapeHtml(launchRoute.filename)}" data-kind="${escapeHtml(launchRoute.kind)}" data-role="${escapeHtml(launchRoute.role)}">${escapeHtml(launchRoute.label)}</button></article>` : '';
  const visualItems = source.kind === 'code-structure' ? (source.root?.children || []).map(item => renderCodeNode(item)).join('') : source.kind === 'command-movelist' ? (source.commands || []).map(item => `<button type="button" data-message="open-full-text" data-line="${Number(item.startLine || item.line || 0)}">${escapeHtml(item.name || item.command || 'Command')}</button>`).join('') : launchCard || `<article><h2>${escapeHtml(source.title || 'Source')}</h2><p>${escapeHtml(source.message || 'Open the exact source in the native editor.')}</p></article>`;
  const styleSource = cspSource ? `${cspSource} 'unsafe-inline'` : "'unsafe-inline'";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${styleSource}; script-src 'nonce-${nonce}'"><style>${viewerToolbar.style()}${AUTHORING_SHELL_CSS}</style></head><body>
    ${require('./shared_workspace_header').html('code',toolbar)}
    
    <div class="shell-controls"><div class="view-switch" role="group" aria-label="Workspace view">${VIEW_MODES.map((mode) => button(mode[0].toUpperCase() + mode.slice(1), `data-message="set-view-mode" data-mode="${mode}" aria-pressed="${viewMode === mode}"`)).join('')}</div>${button('Open Full Text', 'class="open-full-text" data-message="open-full-text" aria-label="Open Full Text in the native editor"')}</div>
    ${model.conflict ? `<p class="conflict" role="alert">${escapeHtml(model.conflict)}</p>` : ''}
    ${renderNavigation(projection, options.navigationAnnouncement)}
    <main id="authoring-content" data-view-mode="${escapeHtml(viewMode)}"><section id="visual-pane" aria-label="Visual view">${visualItems || '<p>No visual structure was found.</p>'}</section><section id="source-pane" ${controlledBy >= 0 ? `role="tabpanel" aria-labelledby="authoring-destination-${controlledBy}"` : 'role="region" aria-label="Focused source view"'}>${largeSource?'<p class="conflict">This source is too large for safe live editing here. Use Open Full Text for the native editor.</p>':''}<p id="source-status" class="source-status" role="status">${editable?'Native-document-backed editor':largeSource?'Native editor required':'Read-only'} · ${model.documentDirty?'Unsaved changes':'Saved to disk'}</p><textarea id="source-editor" aria-label="Source editor" spellcheck="false" ${editable?'':'readonly'}>${escapeHtml(sourceText)}</textarea></section></main>
    <script nonce="${nonce}">(() => { const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null; ${require('./shared_workspace_header').clientScript('vscode')}vscode?.setState(${persistedState}); const allowed = new Set(${JSON.stringify(MESSAGE_TYPES)}); const send = (message) => { if (vscode && allowed.has(message.type)) vscode.postMessage(message); };
      document.addEventListener('click', (event) => { const target = event.target.closest('[data-message]'); if (!target || target.disabled) return; const type = target.dataset.message; if(['select-navigation','previous-navigation','next-navigation','set-view-mode','set-navigation-mode','organize-navigation','toggle-navigation-hand'].includes(type))rememberSourceView(); const message = { type }; if (target.dataset.mode) message.mode = target.dataset.mode; if (target.dataset.id) message.id = target.dataset.id; if (target.dataset.handId) message.id = target.dataset.handId; if(target.dataset.line)message.line=Number(target.dataset.line); if(type==='launch-visual'){message.command=target.dataset.routeCommand;message.filename=target.dataset.filename;message.kind=target.dataset.kind;message.role=target.dataset.role;} send(message); });
      const slider = document.getElementById('destination-slider'); slider?.addEventListener('change', () => {rememberSourceView();send({ type:'select-navigation', index:Number(slider.value)-1 });});
      const editor=document.getElementById('source-editor'),sourceStatus=document.getElementById('source-status');let editRevision=${Number(model.editRevision || 0)},editGeneration=${Number(model.editGeneration || 0)},viewTimer=null;const documentId=${sourceDocumentId},revealNavigationId=${revealNavigationId},focusNavigationId=${focusNavigationId},restoredSourceView=${restoredSourceView};const rememberSourceView=()=>{if(!editor||!documentId)return;send({type:'remember-source-view',generation:editGeneration,documentId,selectionStart:editor.selectionStart,selectionEnd:editor.selectionEnd,selectionDirection:editor.selectionDirection||'none',scrollTop:Math.max(0,Math.round(editor.scrollTop)),scrollLeft:Math.max(0,Math.round(editor.scrollLeft)),focused:document.activeElement===editor})};const queueSourceView=()=>{clearTimeout(viewTimer);viewTimer=setTimeout(rememberSourceView,60)};if(editor){const length=editor.value.length;editor.setSelectionRange(Math.min(length,restoredSourceView.selectionStart),Math.min(length,Math.max(restoredSourceView.selectionStart,restoredSourceView.selectionEnd)),restoredSourceView.selectionDirection);editor.scrollTop=restoredSourceView.scrollTop;editor.scrollLeft=restoredSourceView.scrollLeft;if(restoredSourceView.focused)editor.focus({preventScroll:true});['select','keyup','mouseup','scroll','focus','blur'].forEach(type=>editor.addEventListener(type,rememberSourceView));}editor?.addEventListener('input',()=>{queueSourceView();if(sourceStatus)sourceStatus.textContent='Native-document-backed editor · Unsaved changes';send({type:'edit-source',text:editor.value,revision:++editRevision,generation:editGeneration})});editor?.addEventListener('keydown',event=>{if(event.key==='Tab'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('\t',start,end,'end');editor.dispatchEvent(new Event('input',{bubbles:true}));return}if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='s'){event.preventDefault();vscode?.postMessage({type:${JSON.stringify(require('./universal_toolbar_webview').MESSAGE_TYPE)},slotId:'save'})}});const resolveDestinationKey=${resolveDestinationKey.toString()};const handleDestinationKey=${handleDestinationKey.toString()};const applyDestinationVisibility=${applyDestinationVisibility.toString()};const navigationButtons=[...document.querySelectorAll('[data-nav-destination="true"]')],navigationIds=${canonicalNavigationIds};navigationButtons.forEach(tab=>tab.addEventListener('keydown',event=>handleDestinationKey(navigationIds,tab.dataset.id,event,{preventDefault:()=>event.preventDefault(),rememberSourceView,activate:id=>send({type:'activate-navigation',id})},resolveDestinationKey)));applyDestinationVisibility(navigationButtons,revealNavigationId,focusNavigationId); globalThis.ikemenHasUnappliedForms=()=>false; globalThis.ikemenCanKeepDraft=()=>false;
      window.addEventListener('message', (event) => { if (!event.data || event.data.type !== 'authoring-shell-state') return; });
      
    })();</script></body></html>`;
}

function acceptAuthoringShellMessage(message, handlers = {}) {
  const accepted = validatedAuthoringShellMessage(message);
  if (!accepted) return false;
  const handler = handlers[accepted.type];
  if (typeof handler !== 'function') return false;
  handler(accepted);
  return true;
}

module.exports = {
  VIEW_MODES, CODE_NAVIGATION_MODES, MESSAGE_TYPES, VISUAL_ROUTES, AUTHORING_SHELL_CSS, escapeHtml, navigationProjection,
  visualLaunchRoute, validatedLaunchIntent, validatedAuthoringShellMessage, renderAuthoringShellHtml, render: renderAuthoringShellHtml, acceptAuthoringShellMessage
};
