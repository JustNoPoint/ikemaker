'use strict';

function client() {
  const mapButtons = [...document.querySelectorAll('[data-ikemen-maps]')];
  if (!mapButtons.length) return;
  const surface = mapButtons[0].dataset.ikemenMapSurface || '';
  const adapter = (field) => {
    if (field.hasAttribute('data-ikemen-map-field') && field.hasAttribute('data-ikemen-map-id')) return { grammar: field.dataset.ikemenMapField, id: field.dataset.ikemenMapId };
    if (surface === 'spatial_composer' && field.id === 'trigger') return { grammar: 'expression', id: 'spatial-trigger' };
    if (surface === 'helper') {
      const fields = { trigger: 'expression', maps: 'map-table', mapName: 'name', value: 'expression', guard: 'expression' };
      if (fields[field.id]) return { grammar: fields[field.id], id: `helper-${field.id}` };
    }
    if (surface === 'hitdef' && field.type === 'text' && field.closest('[data-option]')) return { grammar: 'expression', id: `hitdef-${field.closest('[data-option]').dataset.option}`, language: typeof model !== 'undefined' && model.syntax !== 'zss' ? 'ikemen-cns' : 'zss' };
    if (surface === 'move_constants' && field.matches('textarea.code-editor') && field.closest('[data-section]')) { const sectionId = field.closest('[data-section]').dataset.section, section = typeof model !== 'undefined' ? (model.moves || []).flatMap((item) => item.codeSections || []).find((item) => item.id === sectionId) : null, language = section?.language === 'cns' ? 'ikemen-cns' : 'zss'; return { grammar: language === 'zss' ? 'code' : 'expression', id: `move-constants-${sectionId}`, language }; }
    return null;
  };
  let lastField = null, renderEpoch = 0;
  if (typeof MutationObserver === 'function') new MutationObserver(() => { renderEpoch += 1; }).observe(document.body, { childList: true, subtree: true });
  const eligible = (field) => {
    if (!field || field.disabled || field.readOnly || !['INPUT', 'TEXTAREA'].includes(field.tagName)) return null;
    if (field.tagName === 'INPUT' && !['', 'text'].includes(String(field.type || '').toLowerCase())) return null;
    const spec = adapter(field); if (!spec) return null;
    field.dataset.ikemenMapField = spec.grammar; field.dataset.ikemenMapId = spec.id; if (spec.language) field.dataset.ikemenMapLanguage = spec.language;
    return field;
  };
  document.addEventListener('focusin', (event) => { const field = eligible(event.target); if (field) lastField = field; });
  const target = () => {
    const field = eligible(lastField); if (!field || !field.isConnected) return null;
    const rawLanguage = field.dataset.ikemenMapLanguage || document.getElementById('language')?.value || document.body.dataset.codeLanguage || 'zss';
    return {
      id: field.dataset.ikemenMapId, expected: field.value, epoch: renderEpoch,
      start: Number.isInteger(field.selectionStart) ? field.selectionStart : field.value.length,
      end: Number.isInteger(field.selectionEnd) ? field.selectionEnd : field.value.length,
      grammar: field.dataset.ikemenMapField,
      language: rawLanguage === 'cns' ? 'ikemen-cns' : rawLanguage
    };
  };
  for (const button of mapButtons) button.onclick = () => vscode.postMessage({ type: 'ikemenMaps', target: target(), navigationSelection: globalThis.ikemenNavigationSelection?.() });
  addEventListener('message', (event) => {
    const message = event.data; if (message.type !== 'ikemenMapInsert' || !message.target) return;
    const field = [...document.querySelectorAll('[data-ikemen-map-id]')].find((item) => item.dataset.ikemenMapId === message.target.id);
    const valid = field && eligible(field) && renderEpoch === message.target.epoch && field.value === message.target.expected;
    if (!valid) { vscode.postMessage({ type: 'ikemenMapInsertResult', ok: false, reason: 'The visual field changed or was replaced while the map picker was open. Nothing was inserted.' }); return; }
    try {
      field.focus(); field.setRangeText(message.text, message.target.start, message.target.end, 'end');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      vscode.postMessage({ type: 'ikemenMapInsertResult', ok: true });
    } catch (error) { vscode.postMessage({ type: 'ikemenMapInsertResult', ok: false, reason: error.message || 'Map insertion was rejected.' }); }
  });
}

function clientScript() { return `(${client.toString()})();`; }
module.exports = { clientScript };
