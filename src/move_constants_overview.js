'use strict';

function client() {
  let open = saved.overviewOpen === true, query = String(saved.overviewQuery || ''), scope = saved.problemScope === 'all' ? 'all' : 'selected';
  let focusBeforeRefresh = null;
  const prefs = () => vscode.setState({ ...vscode.getState(), overviewOpen: open, overviewQuery: query, problemScope: scope, categoryOpen: saved.categoryOpen });
  const problemReference = (item, member) => ({ id: item.id, memberKey: member?.key || '', filename: member?.filename || '', line: member?.line ?? null, sourceHash: member?.sourceHash || '', sourceId: member?.sourceId || '' });
  function focusToken() {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const token = { id: element.id || '', start: element.selectionStart, end: element.selectionEnd };
    for (const name of ['field', 'code', 'profileValue', 'move', 'overviewProfile', 'overviewAttack', 'overviewBehavior']) if (element.dataset?.[name] !== undefined) { token.data = name; token.value = element.dataset[name]; break; }
    return token;
  }
  function restoreFocus(token) {
    if (!token) return;
    let element = token.id ? document.getElementById(token.id) : null;
    if (!element && token.data) element = [...document.querySelectorAll('[data-' + token.data.replace(/[A-Z]/g, value => '-' + value.toLowerCase()) + ']')].find(item => item.dataset[token.data] === token.value);
    if (!element) return;
    element.focus({ preventScroll: true });
    if (Number.isInteger(token.start) && element.setSelectionRange) try { element.setSelectionRange(token.start, Number.isInteger(token.end) ? token.end : token.start); } catch (_) {}
  }
  function profileReference(profile) {
    const selected = model.moves.find(item => item.id === profile.id);
    return { defPath: model.files.defPath, profileId: profile.id, prefix: profile.prefix, sourceFilename: profile.sourceFilename, sourceHash: profile.sourceHash, actionNumber: selected?.timeline?.actionNumber };
  }
  function filtered() {
    const needle = query.trim().toLowerCase(), overview = model.overview || {};
    const matches = item => !needle || [item.label, item.detail, item.fileLabel, item.prefix, item.moveID, item.stateNumber].some(value => String(value ?? '').toLowerCase().includes(needle));
    return { profiles: (overview.constantProfiles || []).filter(matches), attacks: (overview.controllers || []).filter(matches), behaviors: (overview.behaviors || []).filter(matches) };
  }
  function render() {
    const drawer = $('overviewDrawer'); if (!drawer) return;
    drawer.hidden = !open; $('moveOverview').classList.toggle('active', open);
    const { profiles, attacks, behaviors } = filtered(), totalProfiles = model.overview?.constantProfiles?.length || 0, totalAttacks = model.overview?.controllers?.length || 0, totalBehaviors=model.overview?.behaviors?.length||0,known=[...model.moves.flatMap(item=>item.codeSections||[]),...(model.behaviorComponents||[])],orphans=codeDraftStore.orphaned(known);
    drawer.innerHTML = '<div class="overview-heading"><h2>Moves / Overview</h2><button id="closeOverview" title="Close this drawer without changing the current move">Close</button></div>' +
      '<p class="muted">Browse exact assigned StateDefs, ZSS Functions, HitDefs, and optional constants profiles. Selection never guesses behavior or animation from a state number.</p>' +
      '<input id="overviewSearch" type="search" value="' + esc(query) + '" placeholder="Filter moves, states, files, or HitDefs…" aria-label="Filter all discovered moves">' +
      '<p class="muted">Showing ' + behaviors.length + '/' + totalBehaviors + ' state/function blocks, ' + profiles.length + '/' + totalProfiles + ' constants profiles, and ' + attacks.length + '/' + totalAttacks + ' HitDefs.</p>' +
      '<h3>States and functions</h3><p class="muted">Edit the exact assigned source block. Familiar numbers and comments are search hints only; IKEMaker does not infer an AIR action or behavior category.</p>' +
      (behaviors.length ? behaviors.map(item => '<button class="overview-entry" data-overview-behavior="' + esc(item.id) + '"><b>' + esc(item.label) + '</b>' + (item.shared?' · shared':'') + '<br><span class="muted">' + esc(item.kind) + ' · ' + esc(item.fileLabel) + ':' + (item.line + 1) + '</span></button>').join('') : '<p class="muted">No matching StateDefs or ZSS Functions.</p>') +
      '<h3>Constants profiles</h3>' + (profiles.length ? profiles.map(profile => '<button class="overview-entry" data-overview-profile="' + esc(profile.id) + '" ' + (!profile.supported ? 'disabled title="This profile is not supported by the rich constants editor"' : 'title="Select this profile in the current panel"') + '><b>' + esc(profile.prefix) + '</b>' + (Number.isInteger(profile.moveID) ? ' · State ' + profile.moveID : '') + '<br><span class="muted">' + (profile.supported ? 'Rich constants profile · stay in this panel' : 'Discovered profile · unsupported here') + '</span></button>').join('') : '<p class="muted">No matching constants profiles.</p>') +
      '<h3>Direct code HitDefs</h3><p class="muted">These are exact controllers, not inferred from a matching state number. Select one for read-only inspection; Edit HitDef continues through the established guarded editor.</p>' +
      (attacks.length ? attacks.map(attack => '<button class="overview-entry" data-overview-attack="' + esc(attack.id) + '"><b>' + esc(attack.label) + '</b>' + (attack.detail ? ' · ' + esc(attack.detail) : '') + '<br><span class="muted">Direct code · inspect exact HitDef · ' + esc(attack.fileLabel) + ':' + (attack.line + 1) + '</span></button>').join('') : '<p class="muted">No matching direct HitDefs.</p>')+
      (orphans.length?'<h3>Retained code drafts</h3><p class="muted">These drafts no longer match one exact source block. Review or copy the retained text, then discard it explicitly; IKEMaker will not attach it to another state or function.</p>'+orphans.map((item,index)=>'<details class="problem warning"><summary>'+esc(item.draft.signature||item.draft.kind||'source block')+' · '+esc(item.draft.filename||item.sectionId)+'</summary><p class="muted">Original lines '+(Number(item.draft.baseStartLine)+1)+'–'+(Number(item.draft.baseEndLine)+1)+'</p><textarea class="code-editor" readonly aria-label="Retained code draft">'+esc(item.draft.value||'')+'</textarea><div class="code-actions"><button data-overview-discard-orphan="'+index+'">Discard retained draft</button></div></details>').join(''):'');
    $('closeOverview').onclick = () => { open = false; prefs(); render(); $('moveOverview').focus(); };
    $('overviewSearch').oninput = event => { const start=event.target.selectionStart,end=event.target.selectionEnd;query = event.target.value; prefs(); render(); const input=$('overviewSearch');input?.focus();if(Number.isInteger(start)&&input?.setSelectionRange)input.setSelectionRange(start,Number.isInteger(end)?end:start); };
    document.querySelectorAll('[data-overview-profile]').forEach(button => button.onclick = () => { const profile = (model.overview?.constantProfiles || []).find(item => item.id === button.dataset.overviewProfile); if (profile?.supported) vscode.postMessage({ type: 'overviewProfile', reference: profileReference(profile) }); });
    document.querySelectorAll('[data-overview-attack]').forEach(button => button.onclick = () => { const attack = (model.overview?.controllers || []).find(item => item.id === button.dataset.overviewAttack); if (attack) vscode.postMessage({ type: 'selectDirectComponent', reference: attack.reference || attack }); });
    document.querySelectorAll('[data-overview-behavior]').forEach(button => button.onclick = () => { const item = (model.overview?.behaviors || []).find(candidate => candidate.id === button.dataset.overviewBehavior); if (item) vscode.postMessage({ type: 'selectDirectComponent', reference: item.reference }); });
    document.querySelectorAll('[data-overview-discard-orphan]').forEach(button=>button.onclick=()=>{codeDraftStore.discardId(orphans[Number(button.dataset.overviewDiscardOrphan)].sectionId);render();renderHeader();});
  }
  function activateProblem(item, member) {
    if (!item) return;
    vscode.postMessage({ type: 'overviewProblem', reference: problemReference(item, member) });
  }
  function renderProblems() {
    const all = model.overview?.problems || [], items = scope === 'all' ? all : all.filter(item => (item.members || []).some(member => member.sourceId === move?.id)), errors = items.filter(item => item.level === 'error').length, review = items.filter(item => item.level === 'warning' || item.level === 'likely').length;
    $('problems').innerHTML = '<details class="problems" ' + (errors ? 'open' : '') + '><summary>Problems · ' + errors + ' error' + (errors === 1 ? '' : 's') + ' · ' + review + ' review</summary><div class="problem-scope"><label>Show <select id="problemScope"><option value="selected" ' + (scope === 'selected' ? 'selected' : '') + '>Selected move</option><option value="all" ' + (scope === 'all' ? 'selected' : '') + '>All character files</option></select></label><span class="muted"> ' + items.length + '/' + all.length + ' result' + (items.length === 1 ? '' : 's') + '</span></div>' +
      (items.map((item, index) => { const labels=[...new Set((item.members||[]).map(member=>member.moveLabel).filter(Boolean))];return '<div class="problem ' + esc(item.level || 'info') + '"><b>' + (scope === 'all' && labels.length ? esc(labels.join(', ')) + ' · ' : '') + esc(item.title || item.message || 'Review') + '</b><br><span>' + esc(item.detail || item.message || '') + (labels.length>1?' · affects '+labels.length+' moves':'') + '</span><div class="code-actions"><button data-overview-problem="' + index + '">Show source</button></div></div>';}).join('') || '<div class="problem info">No problems detected in this scope.</div>') + '<div class="problem info">Static timing checks are guidance. Conditional branches, animation changes, loops, and project systems can make different durations intentional; live training remains authoritative.</div></details>';
    $('problemScope').onchange = event => { scope = event.target.value === 'all' ? 'all' : 'selected'; prefs(); renderProblems(); };
    document.querySelectorAll('[data-overview-problem]').forEach(button => button.onclick = () => {const item=items[Number(button.dataset.overviewProblem)],members=item?.members||[],member=members.find(candidate=>candidate.sourceId===move?.id)||members[0];activateProblem(item,member);});
  }
  function rememberCategories() { saved.categoryOpen = [...document.querySelectorAll('.category')].filter(item => item.open).map(item => item.dataset.category); prefs(); }
  function restoreCategories() {
    const remembered = Array.isArray(saved.categoryOpen) ? new Set(saved.categoryOpen) : null;
    for (const category of document.querySelectorAll('.category')) { if (remembered) category.open = remembered.has(category.dataset.category); category.ontoggle = rememberCategories; }
  }
  $('moveOverview').onclick = () => { open = !open; prefs(); render(); if (open) $('overviewSearch')?.focus(); };
  window.addEventListener('message', event => { if (event.data?.type !== 'model') return; focusBeforeRefresh = focusToken(); queueMicrotask(() => { render(); renderProblems(); restoreCategories(); restoreFocus(focusBeforeRefresh); focusBeforeRefresh = null; }); }, true);
  return { render, renderProblems, restoreCategories, state: () => ({ open, query, scope }) };
}

module.exports = { clientScript: () => `const moveOverviewUi=(${client.toString()})();` };
