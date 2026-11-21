'use strict';

const path = require('node:path');
const presentation = require('./viewer_presentation');
const { randomBytes } = require('node:crypto');
const { openWatchLog, KINDS } = require('./ikemeter_watch_log_model');
const { openWatchCandidate, projectMapping, projectResource, scanWatchScope } = require('./ikemeter_watch_navigation');
const { watchIdentity } = require('./ikemeter_watch_source');

const COMMAND = 'ikemen.importIKeMeterWatchLog';
const VIEW = 'ikemenIKeMeterWatchLog';
const PAGE = 40;
const GROUPS = ['write', 'spawn', 'read', 'unresolved'];
const COVERAGE = ['complete', 'partial', 'unknown'];

function safeText(value) {
  return String(value).replace(/[\p{Cc}\p{Cf}]/gu, character => `\\u{${character.codePointAt(0).toString(16)}}`);
}

function valueText(value) {
  if (value === null) return 'Unavailable';
  if (typeof value === 'string') return safeText(JSON.stringify(value));
  return String(value);
}

function watchLabel(row) {
  const key = watchIdentity(row);
  if (!key) return row.kind;
  if (row.kind === 'map') return `Map ${safeText(key.key)}${key.mapIndex === null ? '' : `[${key.mapIndex}]`}`;
  if (['helper', 'explod', 'projectile'].includes(row.kind)) return `${row.kind} ${key.key}`;
  return `${row.kind}(${key.key})`;
}

function scopeIdentity(row) {
  if (!row) return '';
  return JSON.stringify([row.ownerId, row.rootId, row.generation, row.slot ?? null, row.ownerHelperId ?? null,
    row.ownerId === null ? row.seq : null]);
}

function scopeOwnerLabel(row) {
  const parts = [row.ownerId === null ? 'owner runtime ID unavailable' : `owner runtime ID ${row.ownerId}`];
  if (row.rootId !== null) parts.push(`root ID ${row.rootId}`);
  if (row.slot !== undefined) parts.push(`configured slot ${row.slot}`);
  if (row.ownerHelperId != null) parts.push(`configured helper filter ${row.ownerHelperId}`);
  return parts.join(' · ');
}

function rowView(row) {
  return {
    seq: row.seq, tick: row.tick, receiptMs: row.receiptMs, label: watchLabel(row), event: row.event, coverage: row.coverage,
    ownerId: row.ownerId, rootId: row.rootId, entityId: row.entityId, parentId: row.parentId, authoredId: row.authoredId,
    generation: row.generation, ordinal: row.ordinal, field: safeText(row.field), before: valueText(row.before), after: valueText(row.after),
    slot: row.slot, ownerHelperId: row.ownerHelperId, reason: row.reason === undefined ? '' : safeText(row.reason),
    droppedCount: row.droppedCount, hints: row.sourceHints.length, searchable: Boolean(watchIdentity(row)) && row.event !== 'gap',
    effectCount: row.event === 'count' && ['explod', 'projectile'].includes(row.kind), stateContext: row.stateContext
  };
}

function filteredRows(log, filter) {
  const query = filter.query.toLowerCase().trim();
  return log.records.filter(row => (!filter.kind || row.kind === filter.kind) && (!filter.coverage || row.coverage === filter.coverage) &&
    (!query || `${row.seq} ${row.tick} ${watchLabel(row)} ${row.ownerId ?? ''} ${row.event} ${row.field} ${row.before ?? ''} ${row.after ?? ''} ${row.reason || ''}`.toLowerCase().includes(query)));
}

function projectState(state) {
  const { log, hash, filename, filter, selection, scope, candidates } = state;
  const matching = state.matching;
  const entries = matching.slice(state.page * PAGE, (state.page + 1) * PAGE).map(rowView);
  const groups = candidates ? Object.fromEntries(GROUPS.map(role => [role, candidates.groups[role].map((site, index) => ({
    index, role: site.role, grade: site.grade, location: `${safeText(site.resource)} · ${site.line}:${site.column}`,
    label: site.label, reason: site.reason, stateNo: site.stateNo, rank: site.rank, rankReason: site.rankReason,
    rankSources: site.rankSources?.map(source => `${safeText(source.resource)}:${source.line}`)
  }))])) : null;
  const trace = candidates?.trace;
  return {
    type: 'watchView', generation: state.generation, revision: state.revision, filename: safeText(filename), hash,
    engineBuild: log.engineBuild, projectId: log.projectId === null ? 'Unavailable' : safeText(log.projectId),
    sessionId: safeText(log.sessionId), epoch: log.epoch, retention: log.retentionSeconds, dropped: log.dropped, truncated: log.truncated,
    filter, count: log.records.length, matches: matching.length, entries, page: state.page, pages: Math.max(1, Math.ceil(matching.length / PAGE)),
    selection: selection ? rowView(selection) : null, ownerScope: scope ? safeText(scope.ownerResource) : '', scopeOwner: scope?.ownerLabel,
    groups, trace: trace ? { ...trace, routes: trace.routes.map(route => ({ ...route, resource: safeText(route.resource) })) } : undefined,
    skippedFiles: candidates?.skippedFiles, omittedAssignments: candidates?.omittedAssignments,
    omittedSites: candidates?.omittedSites, unmatchedHints: candidates?.unmatchedHints, skippedDetails: candidates?.skippedDetails?.map(safeText),
    notice: safeText(state.notice || '')
  };
}

function trusted(vscode) { return vscode.workspace.isTrusted === true && !vscode.env?.remoteName; }

function html() {
  const nonce = randomBytes(18).toString('base64');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font:var(--vscode-font-size) var(--vscode-font-family);padding:1rem;margin:0}h1,h2,h3,p{margin:0 0 .55rem}button,select,input{font:inherit;padding:.35rem .55rem;border:1px solid var(--vscode-input-border,transparent)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:1px solid var(--vscode-focusBorder)}input,select{background:var(--vscode-input-background);color:var(--vscode-input-foreground)}header,.controls,.pages{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center}header h1{margin-right:auto}header{margin-bottom:.55rem}.meta,.limits{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.controls{margin:1rem 0 .55rem}.controls label{display:flex;align-items:center;gap:.3rem}main{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:1rem}.card{border:1px solid var(--vscode-panel-border);padding:.7rem;min-width:0}.table-wrap{max-height:58vh;overflow:auto}table{border-collapse:collapse;width:100%;text-align:left;min-width:34rem}th,td{padding:.35rem;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;overflow-wrap:anywhere}th{position:sticky;top:0;background:var(--vscode-editor-background)}td button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);white-space:nowrap}td button[aria-pressed=true]{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.pages{margin-top:.55rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem .6rem;margin:.55rem 0}dt{color:var(--vscode-descriptionForeground)}dd{margin:0;overflow-wrap:anywhere}.source-group{border-top:1px solid var(--vscode-panel-border);padding-top:.5rem;margin-top:.6rem}.source-group li{margin-bottom:.4rem;overflow-wrap:anywhere}.source-group button{text-align:left}.notice{color:var(--vscode-descriptionForeground);margin-top:.5rem;overflow-wrap:anywhere}@media(max-width:850px){main{grid-template-columns:1fr}.table-wrap{max-height:40vh}}
${presentation.style()}</style></head><body>
<header><h1>IKeMeter Watch Log</h1>${presentation.chooserHtml()}<button type="button" id="import" disabled>Import watch log…</button></header>
<p class="meta" id="metadata"></p><p class="meta" id="receipt"></p>
<p class="limits">Stock samples can miss changes between observations. Authored source matches are candidates. This format carries no proof that a writer or spawn executed.</p>
<div class="controls"><label>Kind <select id="kind"><option value="">All kinds</option>${KINDS.map(kind => `<option value="${kind}">${kind}</option>`).join('')}</select></label><label>Coverage <select id="coverage"><option value="">All coverage</option>${COVERAGE.map(coverage => `<option>${coverage}</option>`).join('')}</select></label><label>Find observations <input id="query" type="search" maxlength="120"></label></div>
<main><section class="card" aria-label="Observed changes"><h2>Observations</h2><div class="table-wrap"><table><thead><tr><th>Sequence</th><th>GameTime</th><th>Watch</th><th>Owner ID</th><th>Before</th><th>After</th><th>Coverage</th></tr></thead><tbody id="rows"></tbody></table></div><div class="pages"><button type="button" id="previous" disabled data-ikm-action-icon="◀" aria-label="Previous" title="Previous"><span data-ikm-action-label>Previous</span></button><button type="button" id="next" disabled data-ikm-action-icon="▶" aria-label="Next" title="Next"><span data-ikm-action-label>Next</span></button><span id="page"></span></div></section>
<section class="card" aria-labelledby="selectedHeading"><h2 id="selectedHeading">Selected observation</h2><div id="detail"></div><div class="controls"><button type="button" id="scope" disabled>Choose source scope…</button><button type="button" id="scan" disabled>Search candidate sources</button></div><p id="scopeLabel" class="meta"></p><p id="notice" class="notice" role="status"></p><div id="sources"></div></section></main>
<script nonce="${nonce}">(${client.toString().replace('const vscode = acquireVsCodeApi();', 'const vscode = acquireVsCodeApi();'+presentation.clientScript({vscodeVariable:'vscode'}))})();</script></body></html>`;
}

function client() {
  const vscode = acquireVsCodeApi();
  const byId = id => document.getElementById(id);
  let view, timer;
  const send = (type, detail = {}) => vscode.postMessage({ type, generation: view?.generation, revision: view?.revision, ...detail });
  const labels = { write: 'Candidate writes and updates', spawn: 'Candidate spawns', read: 'Read references', unresolved: 'Unresolved source references' };
  const addText = (tag, value, parent) => { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; };
  const shown = value => value === null || value === undefined ? 'Unavailable' : String(value);

  function renderSourceGroup(parent, label, entries, trace = false) {
    if (!entries.length) return;
    const section = document.createElement('section'); section.className = 'source-group'; parent.append(section);
    addText('h3', label, section);
    const items = addText('ul', '', section);
    for (const { group, site } of entries) {
      const item = addText('li', '', items);
      const state = site.stateNo == null ? '' : ` · StateDef ${site.stateNo}`;
      const role = trace && site.role !== 'read' ? (site.role === 'spawn' ? 'Spawn · ' : 'Write or update · ') : '';
      const description = `${role}${site.label}${state} · ${site.location}`;
      if (site.grade === 'candidate') {
        const action = addText('button', description, item);
        action.type = 'button'; action.onclick = () => send('open', { group, index: site.index });
        if (site.rankSources?.length) action.title = `RunState call sites · ${site.rankSources.join(' → ')}`;
        if (site.rankReason) addText('div', site.rankReason, item).className = 'meta';
      } else addText('span', `${description} · ${site.reason}`, item);
    }
  }

  function showState(endpoint) {
    if (!endpoint) return 'Unavailable';
    return `StateNo ${endpoint.stateNo} · GameTime ${endpoint.tick} · sampled entity ${endpoint.entityId} · source owner slot ${shown(endpoint.stateOwnerSlot)}`;
  }

  function render() {
    byId('import').disabled = false;
    byId('metadata').textContent = `${view.filename} · Project ${view.projectId} · Session ${view.sessionId} · epoch ${view.epoch}`;
    byId('receipt').textContent = `Engine ${view.engineBuild} · SHA-256 ${view.hash} · Retention ${shown(view.retention)}${view.retention === undefined ? '' : ' s'} · Dropped ${shown(view.dropped)} · Truncated ${shown(view.truncated)}`;
    const body = byId('rows'), focusedSeq = document.activeElement?.dataset?.sequence; body.replaceChildren();
    for (const row of view.entries) {
      const tr = document.createElement('tr'); body.append(tr);
      const button = addText('button', String(row.seq), addText('td', '', tr));
      button.dataset.sequence = String(row.seq);
      button.type = 'button'; button.setAttribute('aria-pressed', String(row.seq === view.selection?.seq));
      button.setAttribute('aria-label', `Select sequence ${row.seq}, ${row.label}`);
      button.onclick = () => send('select', { seq: row.seq });
      for (const value of [row.tick, `${row.label} · ${row.event}`, shown(row.ownerId), row.before, row.after, row.coverage]) addText('td', value, tr);
      if (button.dataset.sequence === focusedSeq) button.focus({ preventScroll: true });
    }
    byId('page').textContent = `${view.matches} of ${view.count} observations · page ${view.page + 1} of ${view.pages}`;
    byId('previous').disabled = view.page === 0;
    byId('next').disabled = view.page + 1 >= view.pages;
    const detail = byId('detail'), row = view.selection;
    detail.replaceChildren();
    if (row) {
      addText('h3', `${row.label} · ${row.event} · GameTime ${row.tick}`, detail);
      const list = addText('dl', '', detail);
      const values = [['Receipt', `${row.receiptMs} ms`], ['Field', row.field], ['Owner ID', row.ownerId], ['Root ID', row.rootId],
        ['Parent ID', row.parentId], ['Entity ID', row.entityId], ['Authored ID', row.authoredId], ['Generation', row.generation],
        ['Sample-local ordinal', row.ordinal], ['Coverage', row.coverage], ['Before', row.before], ['After', row.after]];
      if (row.slot !== undefined) values.push(['Configured root slot', row.slot]);
      if (row.ownerHelperId !== undefined) values.push(['Configured helper filter', row.ownerHelperId]);
      if (row.reason) values.push(['Coverage reason', row.reason]);
      if (row.droppedCount !== undefined) values.push(['Dropped', row.droppedCount === null ? 'Unknown' : row.droppedCount]);
      if (row.hints) values.push(['Imported source hints', row.hints]);
      if (row.stateContext) {
        values.push(['Current state sample', showState(row.stateContext.current)], ['Previous state sample', showState(row.stateContext.previous)]);
        values.push(['RunState target', 'Unavailable'], ['Executing entity', 'Unavailable']);
      }
      for (const [label, value] of values) { addText('dt', label, list); addText('dd', shown(value), list); }
      if (row.effectCount) addText('p', 'An observed count cannot identify which individual object appeared, departed, or survived.', detail);
    } else addText('p', 'No observations match the selected filters.', detail);
    byId('scope').disabled = !row?.searchable;
    byId('scan').disabled = !row?.searchable || !view.ownerScope;
    byId('scopeLabel').textContent = view.ownerScope ? `User-selected candidate scope · ${view.ownerScope} · ${view.scopeOwner}` : 'Choose the local project and character DEF for source search.';
    byId('notice').textContent = view.notice;
    const sources = byId('sources'); sources.replaceChildren();
    if (!view.groups) return;
    if (view.skippedFiles || view.omittedAssignments || view.omittedSites || view.unmatchedHints) {
      addText('p', `Partial source review · ${view.skippedFiles} unavailable files · ${view.omittedAssignments} assignments outside the scan limit · ${view.omittedSites} sites outside the display limit · ${view.unmatchedHints} unmatched imported hints`, sources);
    }
    if (view.skippedDetails?.length) {
      const missed = addText('details', '', sources); addText('summary', 'Unavailable source details', missed);
      const reasons = addText('ul', '', missed);
      for (const reason of view.skippedDetails) addText('li', reason, reasons);
    }
    if (!Object.values(view.groups).some(sites => sites.length)) addText('p', 'No static source match was found in the files searched. The writer or spawn remains unknown.', sources);
    const entries = group => view.groups[group].map(site => ({ group, site }));
    if (!view.trace) {
      for (const group of Object.keys(view.groups)) renderSourceGroup(sources, labels[group], entries(group));
      return;
    }
    const { endpointNotes, scopeNotes, routes, unresolvedRoutes, limited } = view.trace;
    if (row.stateContext?.current && endpointNotes.current) addText('p', `Current sample · ${endpointNotes.current}`, sources).className = 'meta';
    if (row.stateContext?.previous && endpointNotes.previous) addText('p', `Previous sample · ${endpointNotes.previous}`, sources).className = 'meta';
    for (const note of scopeNotes) addText('p', note, sources).className = 'meta';
    const ranked = [...entries('write'), ...entries('spawn')].sort((left, right) => left.site.rank - right.site.rank);
    renderSourceGroup(sources, 'Ranked source candidates', ranked, true);
    if (unresolvedRoutes || limited) {
      const details = addText('details', '', sources);
      addText('summary', `${unresolvedRoutes} unresolved RunState routes${limited ? ' · reachability limit reached' : ''}`, details);
      const items = addText('ul', '', details);
      for (const route of routes) addText('li', `StateDef ${route.caller} · ${route.resource}:${route.line} · ${route.reason}`, items);
    }
    const unresolved = entries('unresolved');
    renderSourceGroup(sources, 'Unresolved write and spawn sites', unresolved.filter(entry => entry.site.role !== 'read'), true);
    renderSourceGroup(sources, labels.read, [...entries('read'), ...unresolved.filter(entry => entry.site.role === 'read')]);
  }
  addEventListener('message', event => {
    const data = event.data;
    if (data?.type !== 'watchView') return;
    if (!view || data.generation !== view.generation) {
      clearTimeout(timer); byId('kind').value = data.filter.kind; byId('coverage').value = data.filter.coverage; byId('query').value = data.filter.query;
    }
    view = data; render();
  });
  const sendFilter = () => send('filter', { kind: byId('kind').value, coverage: byId('coverage').value, query: byId('query').value });
  byId('kind').onchange = sendFilter;
  byId('coverage').onchange = sendFilter;
  byId('query').oninput = () => { clearTimeout(timer); timer = setTimeout(sendFilter, 170); };
  byId('import').onclick = () => send('import');
  byId('previous').onclick = () => send('page', { page: view.page - 1 });
  byId('next').onclick = () => send('page', { page: view.page + 1 });
  byId('scope').onclick = () => send('scope');
  byId('scan').onclick = () => send('scan');
  send('ready');
}

function register(vscode, context, services = {}) {
  let panel, state, generation = 0, importing = false, busy = false, disposed = false;
  const current = value => state === value && Boolean(panel) && !disposed && trusted(vscode);
  const publish = () => { if (state && panel) void Promise.resolve(panel.webview.postMessage(projectState(state))).catch(() => {}); };

  async function importFile() {
    if (importing || busy || disposed) return false;
    if (!trusted(vscode)) { void vscode.window.showErrorMessage('IKeMeter Watch Log requires a trusted local workspace.'); return false; }
    importing = true;
    const previous = panel;
    try {
      const selected = (await vscode.window.showOpenDialog({ title: 'Import IKeMeter Watch Log', canSelectMany: false,
        canSelectFiles: true, canSelectFolders: false, filters: { 'IKeMeter watch logs': ['json'] } }))?.[0];
      if (!selected || disposed || !trusted(vscode) || previous && previous !== panel) return false;
      if (selected.scheme !== 'file' || !path.isAbsolute(selected.fsPath)) throw new Error('Choose a local IKeMeter watch log.');
      const loaded = await (services.openWatchLog || openWatchLog)(selected.fsPath);
      if (disposed || !trusted(vscode) || previous && previous !== panel) return false;
      state = { ...loaded, hash: loaded.sha256, filename: path.basename(selected.fsPath), generation: ++generation, revision: 0,
        matching: loaded.log.records, page: 0, selection: loaded.log.records[0], filter: { kind: '', coverage: '', query: '' } };
      if (panel) { panel.reveal(vscode.ViewColumn.Active); publish(); }
      else {
        const opened = panel = vscode.window.createWebviewPanel(VIEW, 'IKeMeter Watch Log', vscode.ViewColumn.Active,
          { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
        opened.onDidDispose(() => { if (panel === opened) { panel = undefined; state = undefined; } });
        opened.webview.onDidReceiveMessage(message => {
          if (panel !== opened) return;
          return handleMessage(message);
        });
        opened.webview.html = html();
      }
      return true;
    } catch (error) {
      void vscode.window.showErrorMessage(`IKeMeter Watch Log · ${safeText(error.message)}`);
      return false;
    } finally { importing = false; }
  }

  async function handleMessage(message) {
    const active = state;
    if (!active || !message || !current(active)) return;
    if (presentation.isMessage(message)) return presentation.handle(message, panel);
    if (message.type === 'ready') return publish();
    if (message.generation !== active.generation) return;
    if (message.type === 'import') return importFile();
    if (['filter', 'page', 'select'].includes(message.type)) {
      if (message.type === 'filter') {
        if (typeof message.query !== 'string' || message.query.length > 120 ||
          !['', ...KINDS].includes(message.kind) || !['', ...COVERAGE].includes(message.coverage)) return;
        active.filter = { kind: message.kind, coverage: message.coverage, query: message.query };
        active.matching = filteredRows(active.log, active.filter);
        active.page = 0;
      } else if (message.type === 'page') {
        if (!Number.isInteger(message.page) || message.page < 0 || message.page >= Math.ceil(active.matching.length / PAGE)) return;
        active.page = message.page;
      }
      const pageRows = active.matching.slice(active.page * PAGE, (active.page + 1) * PAGE);
      const selected = message.type === 'select' ? pageRows.find(row => row.seq === message.seq) : pageRows[0];
      if (message.type === 'select' && !selected) return;
      active.selection = selected;
      if (active.scope?.identity !== scopeIdentity(selected)) active.scope = undefined;
      active.revision++;
      active.candidates = undefined;
      active.notice = '';
      return publish();
    }
    const row = active.selection;
    if (busy || importing || !row || row.event === 'gap' || !watchIdentity(row) || message.revision !== active.revision ||
      !['scope', 'scan', 'open'].includes(message.type)) return;
    const revision = active.revision;
    const sameSelection = () => current(active) && active.revision === revision;
    busy = true;
    try {
      if (message.type === 'scope') {
        const folders = (vscode.workspace.workspaceFolders || []).filter(folder => folder.uri.scheme === 'file');
        if (!folders.length) throw new Error('Open the local project folder before searching candidate sources.');
        const owner = scopeOwnerLabel(row);
        const picked = await vscode.window.showQuickPick(folders.map(folder => ({ label: safeText(folder.name).replace(/\$\(/g, '$ ('),
          description: safeText(folder.uri.fsPath), folder })), { title: `Choose candidate project scope · ${owner}` });
        if (!picked || !sameSelection()) return;
        const mapping = projectMapping(picked.folder);
        const def = (await vscode.window.showOpenDialog({ title: `Choose candidate character DEF · ${owner}`, defaultUri: vscode.Uri.file(mapping.root),
          canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: { 'Character DEF': ['def'] } }))?.[0];
        if (!def || !sameSelection()) return;
        if (def.scheme !== 'file' || !path.isAbsolute(def.fsPath) || !/\.def$/i.test(def.fsPath)) throw new Error('Choose a local character DEF in the selected project.');
        active.scope = { mapping, ownerResource: projectResource(mapping.root, def.fsPath), identity: scopeIdentity(row), ownerLabel: owner };
        active.candidates = undefined;
        active.revision++;
        active.notice = 'Candidate scope selected. Search the sources assigned by this DEF.';
      } else if (message.type === 'scan' && active.scope) {
        const { mapping, ownerResource } = active.scope;
        active.candidates = undefined;
        active.notice = 'Searching assigned CNS and ZSS sources…';
        publish();
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Searching IKeMeter source candidates',
          cancellable: true }, (_progress, token) => (services.scanWatchScope || scanWatchScope)(vscode, mapping, ownerResource, row,
          () => sameSelection() && !token.isCancellationRequested));
        if (!sameSelection()) return;
        active.candidates = result;
        active.notice = result ? 'Static source review complete. Runtime attribution remains unknown.' : 'Source search canceled.';
        active.revision++;
      } else if (message.type === 'open' && active.candidates && GROUPS.slice(0, 3).includes(message.group) && Number.isSafeInteger(message.index)) {
        const candidate = active.candidates.groups[message.group][message.index];
        if (!candidate) return;
        await (services.openWatchCandidate || openWatchCandidate)(vscode, active.candidates, candidate, sameSelection);
        if (!sameSelection()) return;
        active.notice = 'Opened the selected source candidate.';
      }
    } catch (error) {
      if (sameSelection()) active.notice = error.message;
    } finally { busy = false; if (current(active)) publish(); }
  }

  const registration = vscode.commands.registerCommand(COMMAND, importFile);
  const session = { dispose() { disposed = true; panel?.dispose(); state = undefined; } };
  context.subscriptions.push(registration, session);
  return session;
}

module.exports = { COMMAND, VIEW, html, register };
