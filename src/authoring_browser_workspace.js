'use strict';

const path = require('path');
const crypto = require('crypto');
const { PROVIDER_IDS, createBrowserRegistry } = require('./authoring_browser_registry');
const { deepFreeze } = require('./authoring_navigation_model');
const { BROWSER_BOUNDS, cloneBounded } = require('./authoring_browser_bounds');
const { clientScript: viewerCloseClientScript } = require('./viewer_close');
const { style: companionBrowserStyle, clientScript: companionBrowserClientScript } = require('./companion_browser_layout');

const MESSAGE_TYPES = Object.freeze(['refresh', 'search', 'set-browser-mode', 'set-filter', 'toggle-glossary', 'toggle-string-flow', 'toggle-impact-paths', 'explain-current-block', 'open-block-explanation-source', 'close-block-explanation', 'mark-resume-context', 'resume-context', 'clear-resume-context', 'selection-intent', 'open-source-intent', 'assistant-action', 'compare-reference', 'create-adaptation-draft', 'edit-glossary', 'toggle-glossary-favorite', 'review-controller-change', 'clear-controller-change-group', 'open-engine-targets', 'open-child', 'close-child', 'escape']);
const allowedMessages = new Set(MESSAGE_TYPES);
const BROWSER_MODES = Object.freeze(['tree','cards']);
const MAX_QUERY_BYTES = BROWSER_BOUNDS.queryBytes;
const COLLECTION_KEYS = Object.freeze(['items', 'rows', 'children', 'groups', 'entries', 'nodes']);
const TEXT_KEYS = Object.freeze(['id', 'label', 'title', 'name', 'description', 'detail', 'kind', 'type', 'family', 'status', 'sourceLabel', 'compatibility', 'reviewController', 'reviewGroup', 'reviewSnapshot', 'markerText']);
const FILTER_KEYS = Object.freeze(['category','status','source','compatibility']);
const STRING_FLOW_ROLES = Object.freeze(['producer','function-argument consumer','function-parameter input','runtime consumer','logger consumer','command-name consumer']);
const MAX_RENDERED_ROWS_PER_PROVIDER=160;
const ASSISTANT_ACTIONS=Object.freeze({
  'focus-similar-code':'Open Similar Code',
  'open-example-templates':'Open Example Templates',
  'open-recipe-library':'Open Recipe Library / Ingredients',
  'open-native-diff':'Open Native Diff',
  'open-coordinate-tools':'Open Spatial / Scale Tools'
});
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
}

function providerLabel(id) {
  return ({ 'code-navigator':'Code Navigator', 'project-data':'Project Data Map', recipes:'Recipe Discovery', 'similar-code':'Similar Code', controllers:'Controllers & Triggers', problems:'Problems' })[id] || id;
}

function plainObject(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype); }
function exactKeys(value, keys) { const actual=Object.keys(value).sort(), expected=[...keys].sort(); return actual.length===expected.length&&actual.every((key,index)=>key===expected[index]); }
function boundedText(value,bytes){if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>bytes)return null;return value;}
function renderText(value){const result=String(value??'');return Buffer.byteLength(result,'utf8')<=BROWSER_BOUNDS.stringBytes?result:'[Oversized value omitted]';}

function contextRoot(context) {
  const candidate = context && typeof context === 'object' ? (context.root || context.directory || '') : '';
  return typeof candidate === 'string' && candidate.trim() ? path.resolve(candidate.trim()) : '';
}
function contextBindingKey(context){
  const files=(context?.files||context?.connectedFiles||[]).filter(value=>typeof value==='string').map(value=>path.resolve(value).toLowerCase()).sort().slice(0,256);
  return JSON.stringify([context?.type||context?.kind||'',context?.identity||context?.id||'',context?.key||'',contextRoot(context).toLowerCase(),files]);
}

function normalizedCapability(value) {
  const target=plainObject(value?.target)?value.target:{};
  const limited=(candidate,max)=>typeof candidate==='string'&&Buffer.byteLength(candidate,'utf8')<=max?candidate:'';
  return Object.freeze({nightlyStringsEnabled:value?.nightlyStringsEnabled===true,target:Object.freeze({
    buildId:limited(target.buildId,256),version:limited(target.version,128),channel:limited(target.channel,64),commit:limited(target.commit,128)
  })});
}

function exactSource(value, root = '') {
  if (!plainObject(value)) return null;
  const candidate = plainObject(value.source) ? value.source : value;
  const pathCandidate = typeof candidate.path === 'string' && /(?:^|[/\\])[^/\\]+\.[a-z0-9]+$/i.test(candidate.path) ? candidate.path : '';
  const filename = candidate.filename || candidate.fsPath || candidate.file || pathCandidate;
  if (typeof filename !== 'string' || !filename.trim()) return null;
  const trimmed = filename.trim(), base = root ? path.resolve(root) : '';
  let resolved;
  if (path.isAbsolute(trimmed)) resolved = path.resolve(trimmed);
  else {
    if (!base) return null;
    resolved = path.resolve(base, trimmed);
    const relative = path.relative(base, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  }
  const source = { filename:resolved };
  if (Number.isInteger(candidate.line) && candidate.line >= 0) source.line = candidate.line;
  if (Number.isInteger(candidate.endLine) && candidate.endLine >= (source.line || 0)) source.endLine = candidate.endLine;
  if (typeof candidate.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(candidate.fingerprint)) source.fingerprint = candidate.fingerprint.toLowerCase();
  if (plainObject(candidate.range)) source.range = candidate.range;
  if (typeof candidate.symbol === 'string' && candidate.symbol) source.symbol = candidate.symbol;
  return Object.freeze(source);
}

function adaptationReview(value) {
  if(!plainObject(value)||value.schema!=='ikemaker.similar-code-adaptation-review'||typeof value.reviewId!=='string'||!/^[a-f0-9]{64}$/i.test(value.reviewId)||value.mutationAllowed!==false)return null;
  const rows=(Array.isArray(value.rows)?value.rows:[]).slice(0,320).flatMap(row=>{
    if(!plainObject(row)||typeof row.id!=='string'||typeof row.kind!=='string'||typeof row.referenceValue!=='string')return[];
    const alternatives=(Array.isArray(row.alternatives)?row.alternatives:[]).slice(0,32).filter(item=>typeof item==='string').map(renderText);
    return[Object.freeze({id:renderText(row.id),kind:renderText(row.kind),referenceValue:renderText(row.referenceValue),status:renderText(row.status||''),selectedValue:renderText(row.selectedValue||''),reviewed:row.reviewed===true,alternatives:Object.freeze(alternatives),note:renderText(row.note||'')})];
  });
  return Object.freeze({reviewId:value.reviewId.toLowerCase(),status:renderText(value.status||'review-only-blocked'),languageCompatible:value.languageCompatible===true,mutationAllowed:false,rows:Object.freeze(rows),blockers:Object.freeze((Array.isArray(value.blockers)?value.blockers:[]).slice(0,32).filter(item=>typeof item==='string').map(renderText)),omittedCount:Number.isSafeInteger(value.omittedCount)&&value.omittedCount>0?value.omittedCount:0,note:renderText(value.note||'')});
}
function glossaryAnnotation(value,id){
  if(typeof id!=='string'||!/^[a-f0-9]{32}$/i.test(id))return null;
  const annotation=plainObject(value)?value:{};
  return Object.freeze({id:id.toLowerCase(),description:renderText(annotation.description||''),aliases:Object.freeze((Array.isArray(annotation.aliases)?annotation.aliases:[]).slice(0,16).filter(item=>typeof item==='string').map(renderText)),favorite:annotation.favorite===true});
}
function assistantAction(value){
  if(!plainObject(value)||typeof value.id!=='string'||!Object.prototype.hasOwnProperty.call(ASSISTANT_ACTIONS,value.id))return null;
  return Object.freeze({id:value.id,label:renderText(value.label||ASSISTANT_ACTIONS[value.id])});
}

function flattenProviderRows(providerId, data, root = '') {
  const rows = [], seen = new Set();
  function visit(value, trail, depth = 0, inheritedStringFlow = false, inheritedStringFlowRoles = [], inheritedGlossary = false, inheritedImpactPath = false) {
    if(rows.length>=BROWSER_BOUNDS.nodes||depth>BROWSER_BOUNDS.depth)return;
    if (Array.isArray(value)) { value.slice(0,BROWSER_BOUNDS.nodes-rows.length).forEach((child, index) => visit(child, [...trail, index], depth, inheritedStringFlow, inheritedStringFlowRoles, inheritedGlossary, inheritedImpactPath)); return; }
    if (!plainObject(value) || seen.has(value)) return;
    seen.add(value);
    const children = COLLECTION_KEYS.flatMap((key) => Array.isArray(value[key]) ? [{ key, values:value[key] }] : []);
    const hasText = TEXT_KEYS.some((key) => typeof value[key] === 'string' || typeof value[key] === 'number');
    if (hasText) {
      const rawId = value.id ?? value.key ?? trail.join('-') ?? rows.length;
      const id = renderText(rawId), label = renderText(value.label ?? value.title ?? value.name ?? id);
      const selection = {};
      for (const key of TEXT_KEYS) if (value[key] !== undefined && ['string','number','boolean'].includes(typeof value[key])) selection[key] = renderText(value[key]);
      selection.id = id; selection.label = label;
      const aliases=Array.isArray(value.aliases)?value.aliases.filter(alias=>typeof alias==='string').slice(0,32).map(renderText):[];
      const ownStringFlowRoles=Array.isArray(value.stringFlowRoles)?value.stringFlowRoles.filter(role=>STRING_FLOW_ROLES.includes(role)).slice(0,STRING_FLOW_ROLES.length):[],stringFlowRoles=ownStringFlowRoles.length?ownStringFlowRoles:inheritedStringFlowRoles,stringFlow=inheritedStringFlow||value.stringFlow===true;
      const impactPath=inheritedImpactPath||['impact-in','impact-out','transition-impact-in','transition-impact-out'].includes(value.kind);
      rows.push(Object.freeze({
        rowId:`${providerId}:${trail.join('.') || rows.length}:${id}`,
        providerId, id, label,
        depth:Math.max(0,Math.min(8,depth)),
        description:renderText(value.description || ''), detail:renderText(value.detail || ''), comparison:renderText(value.comparison || ''), excerpt:renderText(value.excerpt || ''), aliases:Object.freeze(aliases),
        category:renderText(value.family||value.kind||''), status:renderText(value.status||''), sourceLabel:renderText(value.sourceLabel||(value.source?.filename?path.basename(value.source.filename):'')), compatibility:renderText(value.compatibility||''), glossary:inheritedGlossary||value.glossary===true, stringFlow, stringFlowRoles:Object.freeze([...stringFlowRoles]), impactPath,
        selection:Object.freeze(selection), source:exactSource(value, root), adaptation:adaptationReview(value.adaptation), glossaryAnnotation:glossaryAnnotation(value.glossaryAnnotation,value.glossaryMetadataId), assistantAction:assistantAction(value.assistantAction)
      }));
    }
    const childStringFlow=inheritedStringFlow||value.stringFlow===true,ownStringFlowRoles=Array.isArray(value.stringFlowRoles)?value.stringFlowRoles.filter(role=>STRING_FLOW_ROLES.includes(role)).slice(0,STRING_FLOW_ROLES.length):[],childStringFlowRoles=ownStringFlowRoles.length?ownStringFlowRoles:inheritedStringFlowRoles,childGlossary=inheritedGlossary||value.glossary===true,childImpactPath=inheritedImpactPath||['impact-in','impact-out','transition-impact-in','transition-impact-out'].includes(value.kind);
    for (const collection of children) collection.values.forEach((child, index) => visit(child, [...trail, collection.key, index], depth+1, childStringFlow, childStringFlowRoles, childGlossary, childImpactPath));
  }
  if (Array.isArray(data)) visit(data, []);
  else if (plainObject(data)) {
    const collections = COLLECTION_KEYS.filter((key) => Array.isArray(data[key]));
    if (collections.length) collections.forEach((key) => data[key].forEach((child, index) => visit(child, [key, index])));
    else visit(data, []);
  }
  return Object.freeze(rows);
}

function highlight(value, query) {
  const text = String(value || ''), terms = [...new Set(String(query || '').trim().split(/\s+/).filter(Boolean))];
  if (!terms.length) return escapeHtml(text);
  const escaped = terms.sort((left,right) => right.length-left.length).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const expression = new RegExp(`(${escaped.join('|')})`, 'gi'), wanted = new Set(terms.map((term) => term.toLocaleLowerCase()));
  return text.split(expression).map((part) => wanted.has(part.toLocaleLowerCase()) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)).join('');
}

function visibleRows(entry, query = '', root = '', filters = {}) {
  const rows = flattenProviderRows(entry.id, entry.data, root), terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if(filters.category&&row.category!==filters.category)return false;
    if(filters.status&&row.status!==filters.status)return false;
    if(filters.source&&row.sourceLabel!==filters.source)return false;
    if(filters.compatibility&&row.compatibility!==filters.compatibility)return false;
    if(filters.glossary===true&&!row.glossary)return false;
    if(filters.stringFlow===true&&!row.stringFlow)return false;
    if(filters.stringRole&&!row.stringFlowRoles.includes(filters.stringRole))return false;
    if(filters.impactPaths===true&&!row.impactPath)return false;
    if(filters.impactPaths!==true&&row.impactPath)return false;
    const haystack = [row.id,row.label,row.description,row.detail,...row.aliases].join(' ').toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function filterOptions(providers,root){
  const values=Object.fromEntries(FILTER_KEYS.map(key=>[key,new Set()]));
  for(const entry of providers)for(const row of flattenProviderRows(entry.id,entry.data,root)){
    if(row.category)values.category.add(row.category);if(row.status)values.status.add(row.status);if(row.sourceLabel)values.source.add(row.sourceLabel);if(row.compatibility)values.compatibility.add(row.compatibility);
  }
  return Object.fromEntries(FILTER_KEYS.map(key=>[key,[...values[key]].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})).slice(0,256)]));
}

function summarizeData(data, providerId = '') {
  const count = flattenProviderRows(providerId || 'provider', data).length;
  return `${count} result${count === 1 ? '' : 's'}`;
}
function dataItemById(data,id){
  const stack=[];for(const key of COLLECTION_KEYS)if(Array.isArray(data?.[key]))stack.push(...data[key]);let visited=0;
  while(stack.length&&visited++<BROWSER_BOUNDS.nodes){const item=stack.shift();if(!plainObject(item))continue;if(String(item.id??item.key??'')===String(id))return item;for(const key of COLLECTION_KEYS)if(Array.isArray(item[key]))stack.push(...item[key]);}
  return null;
}

function explanationRoute(value, routeId) {
  if(!plainObject(value)||typeof routeId!=='string')return null;
  if(routeId===`block:${value.id}`)return exactSource({filename:value.filename,line:value.node?.startLine,endLine:value.node?.endLine,fingerprint:value.fingerprint});
  for(const item of [...(value.structure?.conditions||[]),...(value.structure?.actions||[]),...(value.dependencies||[]),...(value.diagnostics||[])])if(item?.id===routeId){const source=item.source||{filename:value.filename,line:item.line??value.node?.startLine,endLine:item.endLine??item.line??value.node?.startLine,fingerprint:value.fingerprint};return exactSource(source);}
  return null;
}
function renderBlockExplanation(value){
  if(!plainObject(value)||value.ok!==true)return'';
  const route=(id,label)=>`<button type="button" data-message="open-block-explanation-source" data-route-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
  const countText=Object.entries(value.structure?.counts||{}).filter(([,count])=>Number.isSafeInteger(count)&&count>0).map(([kind,count])=>`${count} ${kind}`).join(' · ')||'No nested parsed items';
  const conditions=(value.structure?.conditions||[]).slice(0,64).map(item=>`<li>${escapeHtml(item.label)} ${route(item.id,`Line ${Number(item.line)+1}`)}</li>`).join('')||'<li>None recognized.</li>';
  const actions=(value.structure?.actions||[]).slice(0,96).map(item=>`<li><b>${escapeHtml(item.kind)}</b>: ${escapeHtml(item.label)} ${route(item.id,`Line ${Number(item.line)+1}`)}</li>`).join('')||'<li>None recognized.</li>';
  const dependencies=(value.dependencies||[]).slice(0,256).map(item=>`<li><b>${escapeHtml(item.label)}</b>: <code>${escapeHtml(item.value)}</code> — ${escapeHtml(item.status)} ${route(item.id,'Open block')}</li>`).join('')||'<li>No supported literal dependency was identified.</li>';
  const diagnostics=(value.diagnostics||[]).slice(0,256).map(item=>`<li><b>${escapeHtml(item.severity)}${item.code?` · ${escapeHtml(item.code)}`:''}</b>: ${escapeHtml(item.message)}${item.meaning?`<br><small>${escapeHtml(item.meaning)}</small>`:''}${item.steps?.length?`<ul>${item.steps.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ul>`:''} ${route(item.id,`Line ${Number(item.source?.line)+1}`)}</li>`).join('')||(value.diagnosticsComplete===false?'<li>No confirmed Problem in the bounded inspected set; additional native Problems were omitted.</li>':'<li>No confirmed native Problem intersects this block.</li>');
  const diagnosticStatus=value.diagnosticsComplete===false?` · review incomplete (${Number(value.diagnosticsOmittedCount)||1} omitted)`:'';
  return `<section class="block-explanation" aria-label="Current block explanation"><header><h2>Explain Current Block</h2>${route(`block:${value.id}`,'Open Block Source')}<button type="button" data-message="close-block-explanation">Close</button></header><p><b>${escapeHtml(value.node?.title||'Current block')}</b> · ${escapeHtml(value.node?.kind||'block')} · lines ${Number(value.node?.startLine)+1}–${Number(value.node?.endLine)+1}</p><p>${escapeHtml(value.node?.purpose||'')}</p><p>${escapeHtml(value.note||'')}</p><details open><summary>Structure · ${escapeHtml(countText)}</summary><h3>Conditions</h3><ul>${conditions}</ul><h3>Actions and calls</h3><ul>${actions}</ul></details><details open><summary>Dependencies (${(value.dependencies||[]).length})</summary><p>${value.catalogComplete?'Resolution uses the complete assigned source catalog.':'The assigned source catalog is incomplete; unresolved-looking references remain unknown.'}</p><ul>${dependencies}</ul></details><details open><summary>Why might this not run? (${(value.diagnostics||[]).length} confirmed${escapeHtml(diagnosticStatus)})</summary><ul>${diagnostics}</ul><p>Static review does not prove runtime reachability, trigger truth, or gameplay behavior.</p></details></section>`;
}
function renderResumeContext(value){
  const marker=plainObject(value)&&typeof value.status==='string'?value:null,status=marker?renderText(marker.status):'empty',usable=marker&&['current','moved'].includes(marker.status)&&plainObject(marker.source),label=marker?renderText(marker.label||'Saved marker'):'No saved marker',detail=marker?renderText(marker.detail||''):'Mark the active connected code block to return to it later.';
  return`<section class="resume-context" aria-label="Resume in Context"><b>Resume in Context</b><span>${escapeHtml(label)} · ${escapeHtml(status)}</span><small>${escapeHtml(detail)}</small><button type="button" data-message="mark-resume-context">Mark Current Block…</button>${marker?`<button type="button" data-message="resume-context"${usable?'':' disabled'}>Resume</button><button type="button" data-message="clear-resume-context">Clear</button>`:''}</section>`;
}

function renderRow(row, query, mode='tree') {
  const semantics=mode==='tree'?` role="treeitem" aria-level="${row.depth+1}" style="--tree-depth:${row.depth}"`:' role="option" aria-selected="false"';
  return `<article class="provider-row ${mode==='cards'?'card-row':'tree-row'}" data-row-id="${escapeHtml(row.rowId)}" data-depth="${row.depth}" tabindex="-1" aria-label="${escapeHtml(row.label)}"${semantics}><div class="row-copy"><h3>${highlight(row.label,query)}</h3>${row.selection.markerText?`<p class="controller-change-marker" role="status"><span aria-hidden="true" style="color:var(--vscode-errorForeground);font-weight:bold">*</span> ${escapeHtml(row.selection.markerText)}</p>`:''}${row.glossaryAnnotation?.description?`<p><b>Glossary:</b> ${highlight(row.glossaryAnnotation.description,query)}</p>`:''}${row.aliases.length?`<small>Matches: ${row.aliases.map(escapeHtml).join(', ')}</small>`:''}${row.description ? `<p>${highlight(row.description,query)}</p>` : ''}${row.detail ? `<small>${highlight(row.detail,query)}</small>` : ''}</div><div class="row-actions"><button type="button" data-message="selection-intent" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}" aria-label="Select ${escapeHtml(row.label)}">Select</button>${row.assistantAction?`<button type="button" data-message="assistant-action" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}" aria-label="${escapeHtml(row.assistantAction.label)} for ${escapeHtml(row.label)}">${escapeHtml(row.assistantAction.label)}</button>`:''}${row.selection.reviewController?`<button type="button" data-message="review-controller-change" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}">Review Change…</button>`:''}${row.selection.reviewGroup?`<button type="button" data-message="clear-controller-change-group" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}">Clear Group Markers…</button>`:''}${row.glossary&&row.glossaryAnnotation?`<button type="button" data-message="edit-glossary" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}" aria-label="Edit local glossary note for ${escapeHtml(row.label)}">Glossary…</button><button type="button" data-message="toggle-glossary-favorite" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}" aria-label="${row.glossaryAnnotation.favorite?'Remove':'Add'} ${escapeHtml(row.label)} ${row.glossaryAnnotation.favorite?'from':'to'} glossary favorites">${row.glossaryAnnotation.favorite?'★':'☆'}</button>`:''}${row.providerId==='similar-code'&&row.excerpt?`<button type="button" data-message="compare-reference" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}" aria-label="Compare current block with ${escapeHtml(row.label)}">Compare</button>`:''}${row.source && row.providerId!=='controllers' ? `<button type="button" data-message="open-source-intent" data-provider-id="${escapeHtml(row.providerId)}" data-row-id="${escapeHtml(row.rowId)}" aria-label="Open source for ${escapeHtml(row.label)}">Open Source</button>` : ''}</div></article>`;
}

function renderProvider(entry, query = '', root = '', mode='tree', filters={},comparisonRowId='') {
  if (entry.status === 'failed') return `<section class="provider failed" data-provider-id="${escapeHtml(entry.id)}"><h2>${escapeHtml(providerLabel(entry.id))}</h2><p role="alert">Unavailable: ${escapeHtml(entry.error?.message || 'Provider failed.')}</p></section>`;
  const matching = visibleRows(entry, query, root, filters), rows=matching.slice(0,MAX_RENDERED_ROWS_PER_PROVIDER),limited=matching.length>rows.length;
  const stale=entry.status==='stale'?`<p class="stale-warning" role="status">Showing last-known-good results: ${escapeHtml(entry.error?.message||'refresh failed')}</p>`:'';
  const collisions=Array.isArray(entry.data?.aliasCollisions)?entry.data.aliasCollisions.slice(0,64):[], ambiguity=collisions.length?`<details class="alias-ambiguity"><summary>${collisions.length} intent alias${collisions.length===1?' is':'es are'} ambiguous</summary><ul>${collisions.map(item=>`<li><b>${escapeHtml(item.phrase||'Alias')}</b> matches ${Number(item.targetCount)||item.targetIds?.length||2} results; refine its configured search terms.</li>`).join('')}</ul></details>`:'';
  const note=typeof entry.data?.note==='string'?`<p class="provider-note">${escapeHtml(entry.data.note)}</p>`:'';
  const compared=entry.id==='similar-code'&&comparisonRowId?flattenProviderRows(entry.id,entry.data,root).find(row=>row.rowId===comparisonRowId):null;
  const seed=entry.id==='similar-code'&&plainObject(entry.data?.seed)?entry.data.seed:null;
  const adaptation=compared?.adaptation,adaptationRows=adaptation?.rows?.length?`<details class="adaptation-review" open><summary>Dependency adaptation review (${adaptation.rows.length}${adaptation.omittedCount?` shown, ${adaptation.omittedCount} omitted`:''})</summary><p>This remains a zero-write review. Create Scratch Draft asks for each unresolved literal and opens native untitled editors with syntax support; it cannot insert, save, copy, or change project source.</p>${adaptation.note?`<p class="provider-note">${escapeHtml(adaptation.note)}</p>`:''}<table><thead><tr><th>Kind</th><th>Reference</th><th>Status</th><th>Current-project alternatives</th></tr></thead><tbody>${adaptation.rows.map(row=>`<tr><td>${escapeHtml(row.kind)}</td><td><code>${escapeHtml(row.referenceValue)}</code></td><td>${escapeHtml(row.status)}</td><td>${row.alternatives.length?row.alternatives.map(value=>`<code>${escapeHtml(value)}</code>`).join(', '):'None'}</td></tr>`).join('')}</tbody></table>${adaptation.blockers.length?`<div class="adaptation-blockers" role="status"><b>Review blockers:</b><ul>${adaptation.blockers.map(value=>`<li>${escapeHtml(value)}</li>`).join('')}</ul></div>`:''}<button type="button" data-message="create-adaptation-draft" data-provider-id="similar-code" data-row-id="${escapeHtml(compared.rowId)}">Create Scratch Draft…</button></details>`:'';
  const comparison=compared&&seed&&typeof seed.excerpt==='string'?`<section class="code-comparison" aria-label="Read-only code comparison"><h3>Current block and working reference</h3><p>Inspection only. No source is copied or changed.</p>${compared.comparison?`<p><b>Meaningful static differences:</b> ${escapeHtml(compared.comparison)}</p>`:''}<div class="comparison-columns"><figure><figcaption>${escapeHtml(seed.label||'Current block')}</figcaption><pre><code>${escapeHtml(seed.excerpt)}</code></pre></figure><figure><figcaption>${escapeHtml(compared.label)}</figcaption><pre><code>${escapeHtml(compared.excerpt)}</code></pre></figure></div>${adaptationRows}</section>`:'';
  return `<section class="provider ${entry.status}" data-provider-id="${escapeHtml(entry.id)}"><h2>${escapeHtml(providerLabel(entry.id))}</h2><p>${escapeHtml(summarizeData(entry.data,entry.id))}${query ? ` · ${matching.length} matching` : ''}${limited?` · showing first ${rows.length}; refine search or filters`:''}</p>${note}${comparison}${stale}${ambiguity}<div class="provider-rows ${mode}-rows" role="${mode==='tree'?'tree':'listbox'}" aria-label="${escapeHtml(providerLabel(entry.id))} results">${rows.length ? rows.map((row) => renderRow(row,query,mode)).join('') : '<p class="empty">No matching results.</p>'}</div></section>`;
}

function renderAuthoringBrowserHtml(state = {}, options = {}) {
  const rawProviders = Array.isArray(state.providers) ? state.providers.slice(0,PROVIDER_IDS.length) : PROVIDER_IDS.map((id) => ({ id, status:'pending', data:null, error:null }));
  const providers=rawProviders.map((entry,index)=>{
    const id=PROVIDER_IDS.includes(entry?.id)?entry.id:(PROVIDER_IDS[index]||'provider');
    try{return {...entry,id,data:cloneBounded(entry?.data??null,`${id} render DTO`)};}
    catch(error){return {id,status:'failed',data:null,error:{message:String(error?.message||error)}};}
  });
  const failures = providers.filter((entry) => entry.status === 'failed' || entry.status==='stale').length;
  const nonce = escapeHtml(options.nonce || 'authoring-browser');
  const query = String(state.query || ''), root = typeof state.contextRoot === 'string' ? state.contextRoot : '', mode=BROWSER_MODES.includes(state.mode)?state.mode:'tree', generation=Number.isSafeInteger(state.generation)?state.generation:0, capability=normalizedCapability(state.capability),comparisonRowId=typeof state.comparisonRowId==='string'?state.comparisonRowId:'';
  const restoreJson=JSON.stringify(options.restore||null).replace(/</g,'\\u003c');
  const filters=plainObject(state.filters)?state.filters:{}, choices=filterOptions(providers,root), glossaryActive=filters.glossary===true, stringFlowEnabled=capability.nightlyStringsEnabled===true, stringFlowActive=stringFlowEnabled&&filters.stringFlow===true,impactPathsActive=filters.impactPaths===true;
  const targetLabel=capability.target.version||capability.target.buildId||'Conservative IKEMEN GO 1.0', targetDetail=[capability.target.channel,capability.target.commit?capability.target.commit.slice(0,12):''].filter(Boolean).join(' · '), stringStatus=capability.nightlyStringsEnabled?'Nightly string tools enabled':'Nightly string tools hidden';
  const engineProfile=`<div class="engine-profile" role="status" aria-label="Active engine capability profile" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-basis:100%;padding:7px 9px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background)"><b>Engine:</b><span>${escapeHtml(targetLabel)}${targetDetail?` · ${escapeHtml(targetDetail)}`:''}</span><span>· ${escapeHtml(stringStatus)}</span><span style="flex:1"></span><button type="button" data-message="open-engine-targets">Engine Targets…</button></div>`;
  const filterSelect=(name,label)=>`${name==='category'?engineProfile:''}<label>${escapeHtml(label)} <select data-filter="${name}" aria-label="${escapeHtml(label)} filter"><option value="">All</option>${choices[name].map(value=>`<option value="${escapeHtml(value)}"${filters[name]===value?' selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label>`;
  const stringFlowButton=stringFlowEnabled?`<button class="view-switch" type="button" data-message="toggle-string-flow" aria-pressed="${stringFlowActive}" title="Show only verified runtime-string producers, consumers, and their source sites">String Flow</button>`:'';
  const glossaryButton=`<button class="view-switch" type="button" data-message="toggle-glossary" aria-pressed="${glossaryActive}" title="Show authored identifiers, scoped names, and documented vocabulary inside Project Data">Identifier Glossary</button>`;
  const impactPathsButton=`<button class="view-switch" type="button" data-message="toggle-impact-paths" aria-pressed="${impactPathsActive}" title="Show bounded indirect function-call and StateDef transition paths inside Project Data">Impact Paths</button>`;
  const stringRoleSelect=stringFlowActive?`<label>String role <select data-filter="stringRole" aria-label="String role filter"><option value="">All</option>${STRING_FLOW_ROLES.map(value=>`<option value="${escapeHtml(value)}"${filters.stringRole===value?' selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label>`:'';
  const renderedProviders=stringFlowActive||glossaryActive||impactPathsActive?providers.filter(entry=>entry.id==='project-data'):providers, explanation=renderBlockExplanation(state.blockExplanation),companionCss=companionBrowserStyle().replaceAll('.ikemaker-companion-browser ',''),resumeContext=`<style>${companionCss}</style>${renderResumeContext(state.resumeContext)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>*{box-sizing:border-box}body{margin:0;padding:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}.browser-content{padding:10px}.browser-content header,.filters,.block-explanation header,.resume-context{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.resume-context{padding:7px 9px;margin:8px 0;border:1px solid var(--vscode-panel-border)}.resume-context small{flex:1;min-width:180px}.browser-content input{min-width:12em;flex:1}.providers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.provider,.block-explanation{border:1px solid var(--vscode-panel-border);padding:10px}.block-explanation{margin:10px 0;border-color:var(--vscode-focusBorder)}.block-explanation h2{margin:0;margin-right:auto}.block-explanation code{overflow-wrap:anywhere}.failed,.stale{border-color:var(--vscode-inputValidation-warningBorder)}.provider-note{padding:6px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background)}.provider-row{display:flex;justify-content:space-between;align-items:start;gap:8px;padding:8px 0;border-top:1px solid var(--vscode-panel-border)}.provider-row:focus{outline:2px solid var(--vscode-focusBorder)}.tree-row{padding-left:calc(var(--tree-depth) * 14px + 4px)}.cards-rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px}.card-row{border:1px solid var(--vscode-panel-border);padding:8px}.provider-row h3,.provider-row p{margin:0 0 4px}.row-copy{min-width:0;overflow-wrap:anywhere}.row-actions{display:flex;gap:4px;flex-wrap:wrap}.code-comparison{border:1px solid var(--vscode-focusBorder);padding:8px;margin:8px 0}.comparison-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.comparison-columns figure{margin:0;min-width:0}.comparison-columns figcaption{font-weight:600;margin-bottom:4px}.comparison-columns pre{margin:0;max-height:22rem;overflow:auto;padding:8px;background:var(--vscode-textCodeBlock-background);white-space:pre}.adaptation-review{margin-top:8px}.adaptation-review table{width:100%;border-collapse:collapse}.adaptation-review th,.adaptation-review td{padding:5px;border:1px solid var(--vscode-panel-border);text-align:left;vertical-align:top}.adaptation-blockers{border-left:3px solid var(--vscode-inputValidation-warningBorder);padding:6px;margin-top:6px}.view-switch[aria-pressed="true"]{border-color:var(--vscode-focusBorder)}mark{color:var(--vscode-editor-findMatchForeground);background:var(--vscode-editor-findMatchHighlightBackground)}.browser-content button:focus-visible,.browser-content input:focus-visible,.browser-content select:focus-visible{outline:2px solid var(--vscode-focusBorder)}@media(max-width:700px){.comparison-columns{grid-template-columns:1fr}.adaptation-review table,.adaptation-review thead,.adaptation-review tbody,.adaptation-review tr,.adaptation-review th,.adaptation-review td{display:block}.adaptation-review thead{position:absolute;left:-10000px}.adaptation-review tr{margin-bottom:6px}}</style></head><body><div class="browser-content"><header><h1>Coding Assistance</h1><input id="search" type="search" maxlength="512" aria-label="Search coding assistance" placeholder="Search" value="${escapeHtml(query)}"><button class="view-switch" type="button" data-message="set-browser-mode" data-mode="tree" aria-pressed="${mode==='tree'}">Tree</button><button class="view-switch" type="button" data-message="set-browser-mode" data-mode="cards" aria-pressed="${mode==='cards'}">Cards</button>${glossaryButton}${stringFlowButton}${impactPathsButton}<button type="button" data-message="explain-current-block">Explain Current Block</button><button type="button" data-message="refresh">Refresh</button></header>${resumeContext}${explanation}<div class="filters" aria-label="Coding Assistance filters">${filterSelect('category','Category')}${filterSelect('status','Status')}${filterSelect('source','Source')}${filterSelect('compatibility','Compatibility')}${stringRoleSelect}</div><p class="refresh-policy">Structure, project data, recipes, and Similar Code update after Save or Refresh. Similar Code uses the active connected native-editor cursor. Problems follow native diagnostics.</p>${glossaryActive?'<p class="provider-note" role="status">Showing authored identifiers and scoped vocabulary from Project Data. Equal local names remain separate by scope.</p>':stringFlowActive?'<p class="provider-note" role="status">Showing verified runtime-string producers, consumers, and their exact source sites for the selected engine target.</p>':impactPathsActive?'<p class="provider-note" role="status">Showing bounded indirect function-call and StateDef transition paths. These are literal source paths, not runtime reachability proof.</p>':''}<p aria-live="polite">${failures ? `${failures} provider${failures === 1 ? '' : 's'} unavailable or stale; available results remain visible.` : 'All authoring providers available.'}</p><main class="providers">${renderedProviders.map((entry) => renderProvider(entry,query,root,mode,filters,comparisonRowId)).join('')}</main></div><script nonce="${nonce}">(() => { const vscode=typeof acquireVsCodeApi==='function'?acquireVsCodeApi():null;const generation=${generation};const persistedRestore=${restoreJson};const priorState=vscode?.getState?.()||{};vscode?.setState?.({...priorState,restore:persistedRestore});const allowed=new Set(${JSON.stringify(MESSAGE_TYPES)});const saveView=()=>{if(!vscode)return;const previous=vscode.getState?.()||{};const active=document.activeElement;vscode.setState({...previous,restore:persistedRestore,focus:active?.id||active?.dataset?.rowId||'',focusKind:active?.id?'id':active?.dataset?.rowId?'row':'',start:active===search?search.selectionStart:null,end:active===search?search.selectionEnd:null,scrollX:window.scrollX,scrollY:window.scrollY})}; const send=message=>{saveView();if(vscode&&allowed.has(message.type))vscode.postMessage({...message,generation})}; document.addEventListener('click',event=>{const target=event.target.closest('[data-message]');if(!target)return;const message={type:target.dataset.message};if(target.dataset.providerId)message.providerId=target.dataset.providerId;if(target.dataset.rowId)message.rowId=target.dataset.rowId;if(target.dataset.routeId)message.routeId=target.dataset.routeId;if(target.dataset.mode)message.mode=target.dataset.mode;send(message)}); const search=document.getElementById('search');search.addEventListener('input',()=>send({type:'search',query:search.value}));document.querySelectorAll('[data-filter]').forEach(select=>select.addEventListener('change',()=>send({type:'set-filter',name:select.dataset.filter,value:select.value})));const rows=()=>[...document.querySelectorAll('.provider-row')];document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();send({type:'escape'});return}const row=event.target.closest?.('.provider-row');if(!row)return;const list=rows(),at=list.indexOf(row);let target=null;if(event.key==='ArrowDown'||event.key==='ArrowRight')target=list[Math.min(list.length-1,at+1)];else if(event.key==='ArrowUp'||event.key==='ArrowLeft')target=list[Math.max(0,at-1)];else if(event.key==='Home')target=list[0];else if(event.key==='End')target=list[list.length-1];else if(event.key==='Enter'||event.key===' '){event.preventDefault();row.querySelector('[data-message="selection-intent"]')?.click();return}if(target){event.preventDefault();row.tabIndex=-1;target.tabIndex=0;target.focus();saveView()}});const first=rows()[0];if(first)first.tabIndex=0;window.addEventListener('message',event=>{const message=event.data;if(message?.type!=='focus-provider'||message.providerId!=='similar-code')return;const provider=document.querySelector('[data-provider-id="similar-code"]');if(!provider)return;provider.scrollIntoView({block:'start'});(provider.querySelector('.provider-row')||provider.querySelector('h2'))?.focus?.()});const saved=vscode?.getState?.();requestAnimationFrame(()=>{if(saved){window.scrollTo(saved.scrollX||0,saved.scrollY||0);const target=saved.focusKind==='id'?document.getElementById(saved.focus):saved.focusKind==='row'?document.querySelector('[data-row-id="'+CSS.escape(saved.focus)+'"]'):null;if(target){target.focus();if(target===search&&Number.isInteger(saved.start))target.setSelectionRange(saved.start,Number.isInteger(saved.end)?saved.end:saved.start)}}});${companionBrowserClientScript()}document.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='b'||!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey||event.repeat||event.isComposing||event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;event.preventDefault();vscode.postMessage({type:'ikemenBrowserShortcut'});},true);})();${viewerCloseClientScript()}</script></body></html>`;
}

class AuthoringBrowserWorkspace {
  constructor(options = {}) {
    this.autoOpen = false;
    this.registry = options.registry || createBrowserRegistry(options.providers || {});
    this.onIntent = typeof options.onIntent === 'function' ? options.onIntent : () => {};
    this.onState = typeof options.onState === 'function' ? options.onState : () => {};
    this.opened = false;
    this.searchOpen = false;
    this.child = null;
    this.query = '';
    this.mode = 'tree';
    this.filters = Object.freeze({category:'',status:'',source:'',compatibility:'',glossary:false,stringFlow:false,stringRole:'',impactPaths:false});
    this.comparisonRowId = '';
    this.blockExplanation = null;
    this.resumeContext = null;
    this.usedExplanationRoutes = new Set();
    this.adaptationRouteInstance=crypto.randomBytes(16).toString('hex');
    this.generation = 0;
    this.contextEpoch = 0;
    this.refreshEpoch = 0;
    this.boundContext = deepFreeze(cloneBounded(options.context || {}, 'browser context'));
    this.boundContextKey=contextBindingKey(this.boundContext);
    this.capability=normalizedCapability(options.capability);
    this.result = { autoOpen:false, providers:PROVIDER_IDS.map((id) => ({ id, status:'pending', data:null, error:null })), failures:[] };
  }

  snapshot() {
    return Object.freeze({ autoOpen:false, opened:this.opened, searchOpen:this.searchOpen, child:this.child, query:this.query, mode:this.mode, filters:this.filters, comparisonRowId:this.comparisonRowId, blockExplanation:this.blockExplanation, resumeContext:this.resumeContext, capability:this.capability, generation:this.generation, contextEpoch:this.contextEpoch, contextRoot:contextRoot(this.boundContext), providers:this.result.providers, failures:this.result.failures });
  }

  async open(context = null) {
    this.opened = true;
    const nextContext=deepFreeze(cloneBounded(context || {}, 'browser context')),nextKey=contextBindingKey(nextContext),changed=nextKey!==this.boundContextKey;
    this.boundContext=nextContext;this.boundContextKey=nextKey;
    if(changed){this.comparisonRowId='';this.blockExplanation=null;this.resumeContext=null;this.usedExplanationRoutes.clear();this.result={autoOpen:false,providers:PROVIDER_IDS.map(id=>({id,status:'pending',data:null,error:null})),failures:[]};}
    const epoch=++this.contextEpoch;
    await this.refresh(epoch);
    return this.snapshot();
  }

  close() { this.opened = false; this.searchOpen = false; this.child = null; this.blockExplanation=null;this.usedExplanationRoutes.clear(); this._changed(); }

  setResumeContext(value){if(!this.opened)return false;let next=null;try{next=value===null?null:deepFreeze(cloneBounded(value,'resume context'));}catch(_){return false;}if(next!==null&&(!plainObject(next)||typeof next.status!=='string'||typeof next.label!=='string'||typeof next.detail!=='string'))return false;this.resumeContext=next;this.generation+=1;this._changed();return true;}

  showBlockExplanation(value, authority={}) {
    if(!this.opened||authority.contextEpoch!==this.contextEpoch||authority.generation!==this.generation||!plainObject(value)||value.schema!=='ikemaker.current-block-explanation'||value.version!==1||value.ok!==true||typeof value.id!=='string'||!/^[a-f0-9]{64}$/i.test(value.id)||typeof value.filename!=='string'||!path.isAbsolute(value.filename)||typeof value.fingerprint!=='string'||!/^[a-f0-9]{64}$/i.test(value.fingerprint))return false;
    const root=contextRoot(this.boundContext),source=exactSource({filename:value.filename,line:value.node?.startLine,endLine:value.node?.endLine,fingerprint:value.fingerprint},root);if(!source)return false;
    try{this.blockExplanation=deepFreeze(cloneBounded(value,'current block explanation'));}catch(_){return false;}this.usedExplanationRoutes.clear();
    this.generation+=1;this._changed();return true;
  }

  setCapability(value, notify = true) {
    const next=normalizedCapability(value);
    if(JSON.stringify(next)===JSON.stringify(this.capability))return false;
    this.capability=next;
    this.blockExplanation=null;
    this.usedExplanationRoutes.clear();
    if(!next.nightlyStringsEnabled&&(this.filters.stringFlow||this.filters.stringRole))this.filters=Object.freeze({...this.filters,stringFlow:false,stringRole:''});
    if(notify){this.generation+=1;this._changed();}
    return true;
  }

  async refresh(expectedContextEpoch = this.contextEpoch) {
    if (!this.opened) throw new Error('Authoring Browser is manual-open only. Call open() first.');
    if(expectedContextEpoch!==this.contextEpoch)return this.snapshot();
    const refreshEpoch=++this.refreshEpoch, context=this.boundContext, refreshed=await this.registry.refresh(context);
    if(expectedContextEpoch!==this.contextEpoch||refreshEpoch!==this.refreshEpoch||context!==this.boundContext)return this.snapshot();
    const previous=new Map(this.result.providers.filter(entry=>['ready','stale'].includes(entry.status)&&entry.data!==null).map(entry=>[entry.id,entry]));
    const providers=refreshed.providers.map(entry=>entry.status==='failed'&&previous.has(entry.id)?{id:entry.id,status:'stale',data:previous.get(entry.id).data,error:entry.error}:entry);
    this.result=deepFreeze({autoOpen:false,providers,failures:providers.filter(entry=>entry.status==='failed'||entry.status==='stale').map(entry=>({providerId:entry.id,message:entry.error?.message||'Provider refresh failed.'}))});
    this._reconcileComparison();
    this.generation += 1;
    this._changed();
    return this.snapshot();
  }

  async refreshProviders(providerIds, expectedContextEpoch = this.contextEpoch) {
    if (!this.opened) throw new Error('Authoring Browser is manual-open only. Call open() first.');
    if(expectedContextEpoch!==this.contextEpoch)return this.snapshot();
    const ids=[...new Set((Array.isArray(providerIds)?providerIds:[]).filter(id=>PROVIDER_IDS.includes(id)))];
    if(!ids.length)return this.snapshot();
    if(ids.length===PROVIDER_IDS.length)return this.refresh(expectedContextEpoch);
    const refreshEpoch=++this.refreshEpoch,context=this.boundContext;
    let refreshed;
    if(typeof this.registry.refreshProviders==='function')refreshed=await this.registry.refreshProviders(context,ids);
    else{const full=await this.registry.refresh(context);refreshed={...full,providers:full.providers.filter(entry=>ids.includes(entry.id))};}
    if(expectedContextEpoch!==this.contextEpoch||refreshEpoch!==this.refreshEpoch||context!==this.boundContext)return this.snapshot();
    const current=new Map(this.result.providers.map(entry=>[entry.id,entry])),updates=new Map();
    for(const entry of refreshed.providers){const previous=current.get(entry.id);updates.set(entry.id,entry.status==='failed'&&previous&&['ready','stale'].includes(previous.status)&&previous.data!==null?{id:entry.id,status:'stale',data:previous.data,error:entry.error}:entry);}
    const providers=PROVIDER_IDS.map(id=>updates.get(id)||current.get(id)||{id,status:'pending',data:null,error:null});
    this.result=deepFreeze({autoOpen:false,providers,failures:providers.filter(entry=>entry.status==='failed'||entry.status==='stale').map(entry=>({providerId:entry.id,message:entry.error?.message||'Provider refresh failed.'}))});
    this._reconcileComparison();
    this.generation+=1;this._changed();return this.snapshot();
  }

  handleMessage(message) {
    if (!this.opened || !plainObject(message) || !allowedMessages.has(message.type) || message.generation!==this.generation) return false;
    if (message.type === 'refresh') {
      if (!exactKeys(message,['type','generation'])) return false;
      return this.refresh().then(state=>{const intent=Object.freeze({type:'refresh-resume-context'}),authority=Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}),handled=this.onIntent(intent,authority);return handled&&typeof handled.then==='function'?handled.then(()=>state):state;});
    }
    if(['mark-resume-context','resume-context','clear-resume-context'].includes(message.type)){
      if(!exactKeys(message,['type','generation'])||(message.type==='resume-context'&&!['current','moved'].includes(this.resumeContext?.status))||(message.type==='clear-resume-context'&&!this.resumeContext))return false;const intent=Object.freeze({type:message.type}),handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if(message.type==='open-engine-targets'){
      if(!exactKeys(message,['type','generation']))return false;
      const intent=Object.freeze({type:'open-engine-targets'}),handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));
      return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if(message.type==='explain-current-block'){
      if(!exactKeys(message,['type','generation']))return false;
      const intent=Object.freeze({type:'explain-current-block'}),authority=Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}),handled=this.onIntent(intent,authority);
      return handled&&typeof handled.then==='function'?handled.then(value=>value===false?false:intent):intent;
    }
    if(message.type==='close-block-explanation'){
      if(!exactKeys(message,['type','generation'])||!this.blockExplanation)return false;this.blockExplanation=null;this.usedExplanationRoutes.clear();this.generation+=1;this._changed();return true;
    }
    if(message.type==='open-block-explanation-source'){
      if(!exactKeys(message,['type','generation','routeId'])||boundedText(message.routeId,1024)===null||!this.blockExplanation)return false;
      const source=explanationRoute(this.blockExplanation,message.routeId);if(!source||this.usedExplanationRoutes.has(message.routeId))return false;this.usedExplanationRoutes.add(message.routeId);
      const intent=Object.freeze({type:'open-block-explanation-source',explanationId:this.blockExplanation.id,routeId:message.routeId,source}),handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));
      return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if (message.type === 'search') { if(!exactKeys(message,['type','generation','query']))return false;const query=boundedText(message.query,MAX_QUERY_BYTES);if(query===null)return false;this.query=query; this.searchOpen = Boolean(this.query); this._changed(); return true; }
    if(message.type==='set-browser-mode'){if(!exactKeys(message,['type','generation','mode'])||!BROWSER_MODES.includes(message.mode))return false;this.mode=message.mode;this._changed();return true;}
    if(message.type==='set-filter'){if(!exactKeys(message,['type','generation','name','value']))return false;const value=boundedText(message.value,256);if(value===null)return false;if(message.name==='stringRole'){if(this.capability.nightlyStringsEnabled!==true||!this.filters.stringFlow||value&&!STRING_FLOW_ROLES.includes(value))return false;}else if(!FILTER_KEYS.includes(message.name))return false;this.filters=Object.freeze({...this.filters,[message.name]:value});this._changed();return true;}
    if(message.type==='toggle-string-flow'){
      if(!exactKeys(message,['type','generation'])||this.capability.nightlyStringsEnabled!==true)return false;
      this.filters=Object.freeze({...this.filters,glossary:false,stringFlow:!this.filters.stringFlow,stringRole:'',impactPaths:false});this._changed();return true;
    }
    if(message.type==='toggle-glossary'){
      if(!exactKeys(message,['type','generation']))return false;
      this.filters=Object.freeze({...this.filters,glossary:!this.filters.glossary,stringFlow:false,stringRole:'',impactPaths:false});this._changed();return true;
    }
    if(message.type==='toggle-impact-paths'){
      if(!exactKeys(message,['type','generation']))return false;
      this.filters=Object.freeze({...this.filters,glossary:false,stringFlow:false,stringRole:'',impactPaths:!this.filters.impactPaths});this._changed();return true;
    }
    if(message.type==='compare-reference'){
      if(!exactKeys(message,['type','generation','providerId','rowId'])||message.providerId!=='similar-code'||boundedText(message.rowId,1024)===null)return false;
      const provider=this.result.providers.find(entry=>entry.id==='similar-code'&&(entry.status==='ready'||entry.status==='stale'));
      const row=provider&&flattenProviderRows(provider.id,provider.data,contextRoot(this.boundContext)).find(candidate=>candidate.rowId===message.rowId&&candidate.excerpt);
      if(!row)return false;this.comparisonRowId=row.rowId;this.generation+=1;this._changed();return true;
    }
    if(message.type==='create-adaptation-draft'){
      if(!exactKeys(message,['type','generation','providerId','rowId'])||message.providerId!=='similar-code'||message.rowId!==this.comparisonRowId||boundedText(message.rowId,1024)===null)return false;
      const provider=this.result.providers.find(entry=>entry.id==='similar-code'&&entry.status==='ready'),row=provider&&flattenProviderRows(provider.id,provider.data,contextRoot(this.boundContext)).find(candidate=>candidate.rowId===message.rowId&&candidate.adaptation),raw=row&&dataItemById(provider.data,row.id);
      if(!row||!raw?.adaptation||raw.adaptation.reviewId!==row.adaptation.reviewId)return false;
      const routeId=crypto.createHash('sha256').update([this.adaptationRouteInstance,this.contextEpoch,this.generation,row.rowId,raw.adaptation.reviewId].join('\0')).digest('hex'),intent=Object.freeze({type:'create-adaptation-draft',routeId,review:raw.adaptation,label:row.label});
      const handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if(message.type==='edit-glossary'||message.type==='toggle-glossary-favorite'){
      if(!exactKeys(message,['type','generation','providerId','rowId'])||message.providerId!=='project-data'||boundedText(message.rowId,1024)===null)return false;
      const provider=this.result.providers.find(entry=>entry.id==='project-data'&&(entry.status==='ready'||entry.status==='stale')),row=provider&&flattenProviderRows(provider.id,provider.data,contextRoot(this.boundContext)).find(candidate=>candidate.rowId===message.rowId&&candidate.glossary&&candidate.glossaryAnnotation);
      if(!row)return false;
      const intent=Object.freeze({type:message.type==='edit-glossary'?'edit-glossary':'toggle-glossary-favorite',metadataId:row.glossaryAnnotation.id,label:row.label,annotation:row.glossaryAnnotation});
      const handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if(message.type==='assistant-action'){
      if(!exactKeys(message,['type','generation','providerId','rowId'])||message.providerId!=='project-data'||boundedText(message.rowId,1024)===null)return false;
      const provider=this.result.providers.find(entry=>entry.id==='project-data'&&(entry.status==='ready'||entry.status==='stale')),row=provider&&flattenProviderRows(provider.id,provider.data,contextRoot(this.boundContext)).find(candidate=>candidate.rowId===message.rowId&&candidate.assistantAction),raw=row&&dataItemById(provider.data,row.id);
      if(!row||!raw||assistantAction(raw.assistantAction)?.id!==row.assistantAction.id)return false;
      const intent=Object.freeze({type:'assistant-action',action:row.assistantAction.id,label:row.label,source:row.source});
      const handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if(message.type==='review-controller-change'||message.type==='clear-controller-change-group'){
      if(!exactKeys(message,['type','generation','providerId','rowId'])||message.providerId!=='controllers'||boundedText(message.rowId,1024)===null)return false;
      const provider=this.result.providers.find(entry=>entry.id==='controllers'&&(entry.status==='ready'||entry.status==='stale')),row=provider&&flattenProviderRows(provider.id,provider.data,contextRoot(this.boundContext)).find(candidate=>candidate.rowId===message.rowId);
      const value=message.type==='review-controller-change'?row?.selection?.reviewController:row?.selection?.reviewGroup;if(!value)return false;
      const intent=Object.freeze({type:message.type,controller:message.type==='review-controller-change'?value:undefined,groupId:message.type==='clear-controller-change-group'?value:undefined,snapshotId:row.selection.reviewSnapshot||''});
      const handled=this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));return handled&&typeof handled.then==='function'?handled.then(()=>intent):intent;
    }
    if (message.type === 'open-child') { if(!exactKeys(message,['type','generation','child']))return false;const child=boundedText(message.child,128);if(child===null||!child)return false;this.child=child;this._changed();return true; }
    if (message.type === 'close-child') { if(!exactKeys(message,['type','generation']))return false;this.child = null; this._changed(); return true; }
    if (message.type === 'escape') {
      if(!exactKeys(message,['type','generation']))return false;
      if (this.blockExplanation) { this.blockExplanation=null;this.usedExplanationRoutes.clear(); this.generation+=1; }
      else if (this.comparisonRowId) { this.comparisonRowId = ''; this.generation += 1; }
      else if (this.child !== null) this.child = null;
      else if (this.searchOpen || this.query) { this.searchOpen = false; this.query = ''; }
      else if (this.filters.impactPaths) this.filters=Object.freeze({...this.filters,impactPaths:false});
      else if (this.filters.stringFlow) this.filters=Object.freeze({...this.filters,stringFlow:false,stringRole:''});
      else if (this.filters.glossary) this.filters=Object.freeze({...this.filters,glossary:false});
      else return false;
      this._changed(); return true;
    }
    if(!exactKeys(message,['type','generation','providerId','rowId'])||boundedText(message.providerId,64)===null||boundedText(message.rowId,1024)===null)return false;
    const provider = this.result.providers.find((entry) => entry.id === message.providerId && (entry.status === 'ready'||entry.status==='stale'));
    const row = provider && flattenProviderRows(provider.id, provider.data, contextRoot(this.boundContext)).find((candidate) => candidate.rowId === message.rowId);
    if (!row || (message.type === 'open-source-intent' && (!row.source||row.providerId==='controllers'))) return false;
    const intent = message.type === 'selection-intent'
      ? this.registry.selectionIntent(row.providerId, row.selection)
      : this.registry.openSourceIntent(row.providerId, row.source);
    const handled = this.onIntent(intent,Object.freeze({context:this.boundContext,contextEpoch:this.contextEpoch,generation:this.generation}));
    return handled && typeof handled.then === 'function' ? handled.then(() => intent) : intent;
  }

  html(options) { return renderAuthoringBrowserHtml(this.snapshot(), options); }
  _reconcileComparison() {
    if(!this.comparisonRowId)return;
    const provider=this.result.providers.find(entry=>entry.id==='similar-code'&&(entry.status==='ready'||entry.status==='stale'));
    const exists=provider&&flattenProviderRows(provider.id,provider.data,contextRoot(this.boundContext)).some(row=>row.rowId===this.comparisonRowId&&row.excerpt);
    if(!exists)this.comparisonRowId='';
  }
  _changed() { this.onState(this.snapshot()); }
}

function createAuthoringBrowserWorkspace(options) { return new AuthoringBrowserWorkspace(options); }

module.exports = {
  MESSAGE_TYPES, MAX_RENDERED_ROWS_PER_PROVIDER, AuthoringBrowserWorkspace, createAuthoringBrowserWorkspace,
  renderAuthoringBrowserHtml, render: renderAuthoringBrowserHtml, summarizeData,
  flattenProviderRows, visibleRows, exactSource, highlight, normalizedCapability, assistantAction, ASSISTANT_ACTIONS
};
