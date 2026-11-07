'use strict';

const fs = require('fs');
const path = require('path');
const def = require('./def_model');
const { parseSelectDef } = require('./select_def_model');
const { rosterCells, portraitFor, resolveAsset, resolveCharacterDef, specialCharacter, gameRoot } = require('./select_roster_preview');

const STEPS = Object.freeze([
  { id: 'logo', label: 'Logo', section: 'Files', key: 'logo.storyboard', type: 'logo' },
  { id: 'intro', label: 'Game intro', section: 'Files', key: 'intro.storyboard', type: 'gameintro' },
  { id: 'bootloading', label: 'Boot loading', section: 'Title Info', key: 'loading.storyboard', type: 'bootloading' },
  { id: 'title', label: 'Title and menus', section: 'Title Info' },
  { id: 'select', label: 'Character select', section: 'Select Info' },
  { id: 'versus', label: 'Versus', section: 'VS Screen', key: 'loading.storyboard', type: 'loading' },
  { id: 'fight', label: 'Fight', section: 'Files', key: 'fight', asset: true },
  { id: 'victory', label: 'Victory', section: 'Victory Screen' },
  { id: 'win', label: 'Win screen', section: 'Win Screen' },
  { id: 'continue', label: 'Continue', section: 'Continue Screen' },
  { id: 'gameover', label: 'Game over', section: 'Game Over Screen', key: 'storyboard', type: 'gameover' },
  { id: 'ending', label: 'Default ending', section: 'Default Ending', key: 'storyboard', type: 'defaultending' },
  { id: 'credits', label: 'End credits', section: 'End Credits', key: 'storyboard', type: 'credits' }
]);

function entryFor(document, sectionName, key) {
  const matches = def.sections(document, sectionName), section = matches[0];
  if (!section) return { section: null, entry: null, ambiguous: false };
  const entries = section.entries.filter(item => item.normalized === key);
  return { section, entry: entries[0] || null, ambiguous: matches.length > 1 || entries.length > 1 };
}

function selectRosterReference(filename, document) {
  const found = entryFor(document, 'Files', 'select');
  if (found.ambiguous) return { source: 'ambiguous', reference: '', file: '' };
  const source = found.entry ? 'explicit' : 'engine-default';
  const reference = found.entry ? def.unquote(found.entry.value).trim() : 'select.def';
  return { source, reference, file: reference ? resolveAsset(reference, filename) : '' };
}

function resolveCharacterStoryboard(reference, characterFile, motifFile, io = fs) {
  if (!reference) return '';
  const cleaned = String(reference).replace(/[\\/]/g, path.sep), root = gameRoot(motifFile), bases = [path.dirname(characterFile), root, path.dirname(motifFile), root && path.join(root, 'data')].filter(Boolean);
  const candidates = path.isAbsolute(cleaned) ? [path.resolve(cleaned)] : bases.map(base => path.resolve(base, cleaned));
  return candidates.find(candidate => io.existsSync(candidate) && io.statSync(candidate).isFile()) || candidates[0] || '';
}

function configuredFlow(filename, document, io = fs) {
  const steps = STEPS.map(spec => {
    const found = entryFor(document, spec.section, spec.key || ''), enabledFound = ['ending','credits','gameover'].includes(spec.id) ? entryFor(document, spec.section, 'enabled') : null, enabledEntry = enabledFound?.entry;
    const enabled = enabledEntry ? Number(enabledEntry.value) !== 0 : ['ending','credits'].includes(spec.id) ? false : spec.id === 'gameover' ? true : null;
    const enabledSource = enabledFound ? enabledEntry ? 'explicit' : 'engine-default' : '';
    const raw = found.entry ? def.unquote(found.entry.value).trim() : '';
    const resolved = raw ? resolveAsset(raw, filename) : '', exists = Boolean(resolved && io.existsSync(resolved));
    const state = found.ambiguous || enabledFound?.ambiguous ? 'ambiguous' : !found.section ? 'section-absent' : enabled === false ? 'disabled' : !spec.key ? 'configured' : !found.entry ? 'inherited-or-unset' : !raw ? 'empty' : exists ? 'ready' : 'missing';
    return { ...spec, state, raw, resolved, exists, line: found.entry?.line ?? found.section?.line ?? null, enabled, enabledSource, explicit: Boolean(found.entry) };
  });
  const titles = def.sections(document, 'Title Info'), title = titles[0], menuEntries = (title?.entries || []).filter(item => /^menu\.itemname\./.test(item.normalized)), counts = new Map();
  for(const item of menuEntries)counts.set(item.normalized,(counts.get(item.normalized)||0)+1);
  const menus = menuEntries.map(item => ({ id: item.normalized.slice('menu.itemname.'.length), label: def.unquote(item.value), line: item.line, hidden: def.unquote(item.value).trim() === '', ambiguous: titles.length>1||counts.get(item.normalized)>1 }));
  return { steps, menus };
}

function characterEndingCoverage(filename, document, flow, io = fs) {
  const selection=selectRosterReference(filename,document),selectFile=selection.file;
  if(!selectFile||!io.existsSync(selectFile))return {state:'unavailable',detail:selection.source==='ambiguous'?'The [Files] select assignment is ambiguous.':selection.source==='explicit'&&!selection.reference?'The [Files] select assignment is explicitly empty.':`${selection.source==='engine-default'?'Engine-default':'Assigned'} select.def was not found: ${selection.reference}`,selectSource:selection.source,characters:[],total:0,scanned:0,truncated:0,summary:{own:0,broken:0,default:0,none:0,unresolved:0}};
  try{
    const roster=parseSelectDef(io.readFileSync(selectFile,'utf8')),fallback=flow.steps.find(step=>step.id==='ending'),defaultReady=Boolean(fallback?.state==='ready'&&fallback?.enabled&&fallback?.exists),characters=[],summary={own:0,broken:0,default:0,none:0,unresolved:0};
    const eligible=roster.characters.filter(entry=>String(entry.exclude||'0')!=='1'&&!specialCharacter(entry.name)),scanned=Math.min(512,eligible.length),truncated=eligible.length-scanned;
    for(const entry of eligible.slice(0,scanned)){
      const characterFile=resolveCharacterDef(selectFile,entry.name);let raw='',resolved='',state='unresolved';
      if(characterFile){try{const character=def.parseDef(io.readFileSync(characterFile,'utf8'),characterFile),ending=entryFor(character,'Arcade','ending.storyboard');if(ending.ambiguous)state='unresolved';else{raw=ending.entry?def.unquote(ending.entry.value).trim():'';resolved=raw?resolveCharacterStoryboard(raw,characterFile,filename,io):'';state=raw?io.existsSync(resolved)?'own':'broken':defaultReady?'default':'none';}}catch(_){state='unresolved';}}
      summary[state]++;characters.push({name:entry.name,characterFile,raw,resolved,state});
    }
    return {state:truncated?'partial':'ready',detail:`Reviewed ${scanned} of ${eligible.length} roster character(s) from ${selection.source==='engine-default'?'engine-default':'assigned'} ${selection.reference}${truncated?`; ${truncated} beyond the 512-character scan limit were not reviewed`:''}. A broken character ending path can suppress the default ending at runtime.`,selectFile,selectSource:selection.source,defaultReady,characters,total:eligible.length,scanned,truncated,summary};
  }catch(error){return {state:'warning',detail:`Could not review character endings: ${error.message}`,characters:[],total:0,scanned:0,truncated:0,summary:{own:0,broken:0,default:0,none:0,unresolved:0}};}
}

function selectRosterPreview(filename, document, grid, io = fs) {
  const selection = selectRosterReference(filename, document), raw = selection.reference, resolved = selection.file;
  if (selection.source === 'ambiguous') return { state: 'ambiguous', detail: 'Duplicate [Files] sections or select keys; review the source.', cells: [] };
  if (!raw) return { state: 'unassigned', detail: '[Files] select is explicitly empty. The grid shows layout guides only.', selectSource: selection.source, cells: [] };
  if (!io.existsSync(resolved)) return { state: 'missing', detail: `${selection.source === 'engine-default' ? 'Engine-default' : 'Assigned'} select.def was not found: ${raw}`, file: resolved, selectSource: selection.source, cells: [] };
  try {
    const roster = parseSelectDef(io.readFileSync(resolved, 'utf8'));
    const cells = rosterCells(roster), availableSlots = Math.max(0, Number(grid?.rows || 1) * Number(grid?.columns || 1) - (grid?.skippedCells?.length || 0)), capacity = Math.min(256, availableSlots);
    const selected = cells.slice(0, capacity), selectInfo = def.sectionMap(def.sections(document, 'Select Info')[0]);
    const portraitSpec = { sprite: def.integerTuple(selectInfo['portrait.spr'] || '9000,0'), offset: def.tuple(selectInfo['portrait.offset'] || '0,0'), scale: def.tuple(selectInfo['portrait.scale'] || '1,1', 2, 1) };
    return { state: 'ready', detail: `${selected.length} roster slot(s) from ${selection.source === 'engine-default' ? 'engine-default ' : ''}${path.basename(resolved)}${cells.length > capacity ? `; ${cells.length - capacity} beyond preview capacity` : ''}`, file: resolved, selectSource: selection.source, total: cells.length, portraitSpec, cells: selected.map((cell, index) => {
      const portrait = portraitFor(resolved, cell.members[0], portraitSpec);
      const motifWidth = Number(grid?.localCoord?.[0]) || 320, characterWidth = Number(portrait.localCoord?.[0]) || 320, resolutionScale = portrait.preload ? 1 : (Number(portrait.portraitScale) || 1) * motifWidth / characterWidth;
      return { index, kind: cell.kind, name: cell.name, hidden: cell.hidden || '', portrait: { state: portrait.state, detail: portrait.detail || '', src: portrait.src || '', width: (portrait.width || 0) * resolutionScale * portraitSpec.scale[0], height: (portrait.height || 0) * resolutionScale * portraitSpec.scale[1] } };
    }) };
  } catch (error) { return { state: 'warning', detail: `Could not read assigned select.def: ${error.message}`, file: resolved, cells: [] }; }
}

module.exports = { STEPS, configuredFlow, selectRosterReference, resolveCharacterStoryboard, selectRosterPreview, characterEndingCoverage };
