'use strict';

const SOURCES = [
  { id: 'compiler', url: 'https://raw.githubusercontent.com/ikemen-engine/Ikemen-GO/develop/src/compiler.go' },
  { id: 'controllerWiki', url: 'https://raw.githubusercontent.com/wiki/ikemen-engine/Ikemen-GO/State-controllers-(new).md' },
  { id: 'triggerWiki', url: 'https://raw.githubusercontent.com/wiki/ikemen-engine/Ikemen-GO/Triggers-(new).md' }
];
function plain(value) {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
}
function sections(text, markdown) {
  const pattern = markdown ? /^##\s+(?:<a\s+name="([^"]+)"[^>]*>)?([^\n]*?)(?:<\/a>)?\s*$/gm : /<h2\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi;
  const headings = [...String(text).matchAll(pattern)];
  return headings.map((m, i) => ({ id: m[1] || '', label: plain(m[2]), body: text.slice(m.index + m[0].length, headings[i + 1]?.index ?? text.length) }));
}
function names(label) {
  return label.replace(/(?:\s+\([^()]*\))+\s*$/i, '').split(/\s*,\s*|\s+\/\s+|\s+and\s+/i).map(x => x.trim()).filter(x => /^[A-Za-z][A-Za-z0-9]*(?:\([^)]*\))?$/.test(x));
}
function parameters(body, markdown) {
  const result = [], pattern = markdown ? /\*\*([^\n]*?)\*\*/g : /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi;
  let required = false;
  for (const m of body.matchAll(pattern)) {
    const value = plain(m[1]);
    if (/^required parameters/i.test(value)) required = true;
    else if (/^optional parameters/i.test(value)) required = false;
    else {
      const match = /^([a-zA-Z][\w.]*)\s*=\s*(.+)$/.exec(value);
      if (match && !result.some(x => x.name.toLowerCase() === match[1].toLowerCase())) result.push({ name: match[1], placeholder: match[2], required });
    }
  }
  return result;
}
function documents(text, { markdown = false, kind = 'controller', url = '' } = {}) {
  return sections(text, markdown).flatMap(section => {
    if (markdown ? !/^(?:new_|redirection_)/i.test(section.id) : !/\((?:new|changed|old)\)$/i.test(section.label)) return [];
    // The official trigger page includes redirections; retain their actual kind.
    const actualKind = /redirection/i.test(section.id) ? 'redirection' : kind;
    return names(section.label).map(label => {
      const name = label.replace(/\(.*$/, ''), body = section.body;
      const status = /\((new|changed|old)\)$/i.exec(section.label)?.[1]?.toLowerCase() || 'new';
      const description = plain(body.replace(/```[\s\S]*?```/g, '').split(/(?:\*\*|<p><strong>)/i)[0]).slice(0, 1600);
      const result = { name, status, description, url: `${url}#${section.id}` };
      if (kind === 'controller') result.params = parameters(body, markdown);
      else {
        const field = name => {
          const html = new RegExp('<strong>' + name + ':?</strong>\\s*(?:<br\\s*/?>)?\\s*([\\s\\S]*?)</p>', 'i');
          const wiki = new RegExp('\\*\\*' + name + ':?\\*\\*\\s*:?\\s*([^\\n]+)', 'i');
          const match = (markdown ? wiki : html).exec(body);
          return match ? plain(match[1]) : '';
        };
        result.kind = actualKind; result.signature = field('Format') || label; result.arguments = field('Arguments') || ''; result.returnType = field('Return type') || '';
      }
      if (/nightly(?: build)? only/i.test(section.label) || /^nightly(?: build)? only[.:]/i.test(plain(body))) result.availability = 'nightly';
      return result;
    });
  });
}
function compilerControllers(text) {
  const block = /c\.scmap\s*=\s*map\[string\]scFunc\s*\{([\s\S]*?)\n\s*\}/.exec(text)?.[1] || '';
  return [...block.matchAll(/"([a-zA-Z][\w]*)"\s*:\s*c\.([\w]+)/g)].map(m => ({ name: m[2].toLowerCase() === m[1].toLowerCase() ? m[2] : m[1], compilerName: m[1], status: 'new', params: [], availability: 'nightly', url: SOURCES[0].url }));
}
function merge(current, discovered, bundled = current) {
  const curated = new Map(bundled.map(item => [item.name.toLowerCase(), item]));
  // Repair older caches with the bundled metadata even when all sources fail.
  const map = new Map(current.map(item => {
    const base = curated.get(item.name.toLowerCase()), repaired = { ...item, ...base };
    if (item.params && base?.params) {
      const params = new Map(item.params.map(p => [String(p.name || p).toLowerCase(), p]));
      for (const p of base.params) params.set(String(p.name || p).toLowerCase(), p);
      repaired.params = [...params.values()];
    }
    if (item.capabilityId) repaired.capabilityId = item.capabilityId;
    return [item.name.toLowerCase(), repaired];
  }));
  for (const item of bundled) if (!map.has(item.name.toLowerCase())) map.set(item.name.toLowerCase(), item);
  for (const item of discovered) {
    const key = item.name.toLowerCase(), old = map.get(key), base = curated.get(key);
    const next = { ...old, ...item, ...base };
    // A compiler-only placeholder is superseded by documentation, including
    // removal of its conservative Nightly availability when docs omit it.
    if (!base && !item.compilerName && !item.availability) delete next.availability;
    if (old?.capabilityId) next.capabilityId = old.capabilityId;
    if (item.params) {
      const params = new Map((old?.params || []).map(p => [String(p.name || p).toLowerCase(), p]));
      for (const param of item.params) params.set(String(param.name || param).toLowerCase(), param);
      for (const param of base?.params || []) params.set(String(param.name || param).toLowerCase(), param);
      next.params = [...params.values()];
    }
    if (!base) next.upstreamDiscovered = true;
    map.set(key, next);
  }
  const catalog = [...map.values()].sort((a,b) => a.name.localeCompare(b.name));
  return { catalog, added: catalog.filter(x => !current.some(y => y.name.toLowerCase() === x.name.toLowerCase())).map(x => x.name), removed: [], changed: catalog.filter(x => { const old = current.find(y => y.name.toLowerCase() === x.name.toLowerCase()); return old && JSON.stringify(old) !== JSON.stringify(x); }).map(x => x.name) };
}
function discover(sources, controllers, triggers, bundledControllers = require('../data/sctrl.json'), bundledTriggers = require('../data/triggers.json')) {
  const controllerDocs = documents(sources.sctrl?.text || '', { url: 'https://potsmugen.github.io/ikemen-merged-docs/sctrl' });
  controllerDocs.push(...documents(sources.controllerWiki?.text || '', { markdown: true, url: 'https://github.com/ikemen-engine/Ikemen-GO/wiki/State-controllers-(new)' }));
  const triggerDocs = documents(sources.triggers?.text || '', { kind: 'trigger', url: 'https://potsmugen.github.io/ikemen-merged-docs/triggers' });
  triggerDocs.push(...documents(sources.redirections?.text || '', { kind:'redirection', url:'https://potsmugen.github.io/ikemen-merged-docs/redirections' }));
  triggerDocs.push(...documents(sources.triggerWiki?.text || '', { markdown: true, kind: 'trigger', url: 'https://github.com/ikemen-engine/Ikemen-GO/wiki/Triggers-(new)' }));
  // Documentation provides casing and parameters before compiler-only discoveries.
  return { controllers: merge(controllers, [...controllerDocs, ...compilerControllers(sources.compiler?.text || '').filter(item => ![...controllers, ...controllerDocs].some(known => known.name.toLowerCase() === item.name.toLowerCase()))], bundledControllers), triggers: merge(triggers, triggerDocs, bundledTriggers) };
}
module.exports = { SOURCES, plain, sections, parameters, documents, compilerControllers, merge, discover };

