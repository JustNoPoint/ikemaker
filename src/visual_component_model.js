'use strict';

const { parseDef, normalize } = require('./def_model');

const CURRENT_SCHEMA = 1;
const KINDS = Object.freeze(['stage-background', 'stage-assembly', 'storyboard-scene', 'ui-element-group']);

function clean(value, fallback = '') { return String(value == null ? '' : value).replace(/[\r\n]/g, ' ').trim() || fallback; }
function slug(value) { return clean(value, 'component').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'component'; }
function eolOf(text) { return String(text).includes('\r\n') ? '\r\n' : '\n'; }
function cloneEntries(entries) { return (entries || []).map(item => ({ key: clean(item.key), value: String(item.value == null ? '' : item.value) })).filter(item => item.key); }

function normalizeComponent(raw = {}) {
  if(raw.kind==='stage-assembly')return require('./stage_assembly_model').normalizeAssembly(raw);
  const kind = KINDS.includes(raw.kind) ? raw.kind : '';
  if (!kind) throw new Error('Choose a Stage, Storyboard, or UI component type.');
  const name = clean(raw.name, 'Reusable component'), entries = cloneEntries(raw.entries);
  if (!entries.length) throw new Error('A reusable component must contain at least one property.');
  return Object.freeze({
    schemaVersion: CURRENT_SCHEMA,
    id: slug(raw.id || `${kind}-${name}`),
    kind,
    name,
    entries: Object.freeze(entries.map(Object.freeze)),
    metadata: Object.freeze(raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {})
  });
}

function normalizeStore(raw = {}) {
  const seen = new Set(), components = [];
  for (const rawComponent of raw.components || []) {
    let component;
    try { component = normalizeComponent(rawComponent); } catch (_) { continue; }
    if (seen.has(component.id)) continue;
    seen.add(component.id); components.push(component);
  }
  return Object.freeze({ schemaVersion: CURRENT_SCHEMA, components: Object.freeze(components) });
}

function upsert(store, rawComponent) {
  const current = normalizeStore(store), component = normalizeComponent(rawComponent);
  return normalizeStore({ components: [...current.components.filter(item => item.id !== component.id), component] });
}

function remove(store, id) { return normalizeStore({ components: normalizeStore(store).components.filter(item => item.id !== String(id)) }); }

function sectionAt(document, line) {
  const section = document.sections.find(item => item.name && item.line === Number(line));
  if (!section || !section.name) throw new Error('The selected source section no longer exists.');
  return section;
}

function captureSection(text, line, kind, options = {}) {
  if (!['stage-background', 'storyboard-scene'].includes(kind)) throw new Error('This component type is not a complete source section.');
  const section = sectionAt(parseDef(text), line);
  if (kind === 'stage-background' && !/^bg(?:\s|$)/i.test(section.name)) throw new Error('Select a stage BG section.');
  if (kind === 'storyboard-scene' && !/^scene\s+\d+$/i.test(section.name)) throw new Error('Select a numbered storyboard scene.');
  const fallback = kind === 'stage-background' ? section.name.replace(/^bg\s*/i, '') : section.name;
  return normalizeComponent({ id: options.id, kind, name: options.name || fallback, entries: section.entries, metadata: { sourceSection: section.name, ...options.metadata } });
}

function captureUiElement(text, sectionLine, base, options = {}) {
  const section = sectionAt(parseDef(text), sectionLine), prefix = `${normalize(base)}.`;
  if (!normalize(base)) throw new Error('Choose a UI element prefix.');
  const entries = section.entries.filter(item => item.normalized.startsWith(prefix)).map(item => ({ key: item.key.slice(item.key.indexOf('.') + 1), value: item.value }));
  if (!entries.length) throw new Error(`No ${base}.* properties exist in [${section.name}].`);
  return normalizeComponent({ id: options.id, kind: 'ui-element-group', name: options.name || base, entries, metadata: { sourceSection: section.name, sourceBase: base, ...options.metadata } });
}

function uniqueSectionName(document, desired) {
  const used = new Set(document.sections.map(item => item.normalized)), base = clean(desired, 'Component');
  if (!used.has(normalize(base))) return base;
  for (let number = 2; number < 10000; number += 1) if (!used.has(normalize(`${base} ${number}`))) return `${base} ${number}`;
  throw new Error(`Could not allocate a unique section name for ${base}.`);
}

function appendRawSection(text, name, entries) {
  const eol = eolOf(text), prefix = String(text).endsWith('\n') ? '' : eol;
  return `${text}${prefix}[${name}]${eol}${entries.map(item => `${item.key} = ${item.value}`).join(eol)}${eol}`;
}

function insertSectionComponent(text, rawComponent, options = {}) {
  const component = normalizeComponent(rawComponent), document = parseDef(text);
  if (component.kind === 'stage-background') {
    const name = uniqueSectionName(document, `BG ${clean(options.name, component.name).replace(/^bg\s*/i, '')}`);
    return { text: appendRawSection(text, name, component.entries), identity: name };
  }
  if (component.kind === 'storyboard-scene') {
    const used = document.sections.map(item => /^scene\s+(\d+)$/i.exec(item.name)).filter(Boolean).map(match => Number(match[1]));
    const requested = Number(options.number), number = Number.isSafeInteger(requested) && requested >= 0 && !used.includes(requested) ? requested : (used.length ? Math.max(...used) + 1 : 0);
    return { text: appendRawSection(text, `Scene ${number}`, component.entries), identity: number };
  }
  throw new Error('Use UI element insertion for grouped UI properties.');
}

function insertUiElement(text, sectionLine, rawComponent, options = {}) {
  const component = normalizeComponent(rawComponent);
  if (component.kind !== 'ui-element-group') throw new Error('Choose a grouped UI element component.');
  const document = parseDef(text), section = sectionAt(document, sectionLine), base = uniqueUiBase(text,sectionLine,options.base||component.name);
  const later = document.sections.find(item => item.line > section.line), at = later ? later.line : document.lines.length, lines = [...document.lines];
  lines.splice(at, 0, ...component.entries.map(item => `${base}.${item.key} = ${item.value}`), '');
  return { text: lines.join(eolOf(text)), identity: base };
}

function uniqueUiBase(text, sectionLine, desired = 'new.element') {
  const section=sectionAt(parseDef(text),sectionLine),requested=clean(desired,'new.element').replace(/[^A-Za-z0-9_.-]+/g,'.'),keys=section.entries.map(item=>item.normalized);
  const conflicts=candidate=>keys.some(key=>key.startsWith(`${normalize(candidate)}.`));
  if(!conflicts(requested))return requested;
  for(let number=2;number<10000;number+=1)if(!conflicts(`${requested}${number}`))return `${requested}${number}`;
  throw new Error(`Could not allocate a unique UI prefix for ${requested}.`);
}

module.exports = { CURRENT_SCHEMA, KINDS, normalizeComponent, normalizeStore, upsert, remove, captureSection, captureUiElement, insertSectionComponent, insertUiElement, uniqueSectionName, uniqueUiBase };
