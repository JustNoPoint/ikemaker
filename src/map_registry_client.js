'use strict';

function client() {
  const mapButtons = [...document.querySelectorAll('[data-ikemen-maps]')];
  if (!mapButtons.length) return;
  const surface = mapButtons[0].dataset.ikemenMapSurface || '', pending = new Map(), maxValue = 524288;
  const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
  const keys = (value, names) => plain(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|');
  const bytes = value => new TextEncoder().encode(String(value)).length;
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const validCode = code => ['ok', 'cancelled', 'stale', 'busy', 'unsupported', 'conflict', 'write-failed', 'disposed', 'timeout'].includes(code);
  const adapter = field => {
    if (field.hasAttribute('data-ikemen-map-field') && field.hasAttribute('data-ikemen-map-id')) return { grammar: field.dataset.ikemenMapField, id: field.dataset.ikemenMapId };
    if (surface === 'spatial_composer' && field.id === 'trigger') return { grammar: 'expression', id: 'spatial-trigger' };
    if (surface === 'helper') { const fields = { trigger: 'expression', maps: 'map-table', mapName: 'name', value: 'expression', guard: 'expression' }; if (fields[field.id]) return { grammar: fields[field.id], id: `helper-${field.id}` }; }
    if (surface === 'hitdef' && field.type === 'text' && field.closest('[data-option]')) return { grammar: 'expression', id: `hitdef-${field.closest('[data-option]').dataset.option}`, language: typeof model !== 'undefined' && model.syntax !== 'zss' ? 'ikemen-cns' : 'zss' };
    if (surface === 'move_constants' && field.matches('textarea.code-editor') && field.closest('[data-section]')) { const sectionId = field.closest('[data-section]').dataset.section, section = typeof model !== 'undefined' ? (model.moves || []).flatMap(item => item.codeSections || []).find(item => item.id === sectionId) : null, language = section?.language === 'cns' ? 'ikemen-cns' : 'zss'; return { grammar: language === 'zss' ? 'code' : 'expression', id: `move-constants-${sectionId}`, language }; }
    return null;
  };
  let lastField = null, renderEpoch = 0, bridgeEpoch = 1;
  if (typeof MutationObserver === 'function') new MutationObserver(() => { renderEpoch += 1; bridgeEpoch += 1; pending.clear(); }).observe(document.body, { childList: true, subtree: true });
  const eligible = field => { if (!field || field.disabled || field.readOnly || !['INPUT', 'TEXTAREA'].includes(field.tagName)) return null; if (field.tagName === 'INPUT' && !['', 'text'].includes(String(field.type || '').toLowerCase())) return null; const spec = adapter(field); if (!spec) return null; field.dataset.ikemenMapField = spec.grammar; field.dataset.ikemenMapId = spec.id; if (spec.language) field.dataset.ikemenMapLanguage = spec.language; return field; };
  document.addEventListener('focusin', event => { const field = eligible(event.target); if (field) { if (lastField !== field) bridgeEpoch += 1; lastField = field; } });
  const target = () => { const field = eligible(lastField); if (!field || !field.isConnected || field.value.length > maxValue) return null; const rawLanguage = field.dataset.ikemenMapLanguage || document.getElementById('language')?.value || document.body.dataset.codeLanguage || 'zss'; return { surface, id: field.dataset.ikemenMapId, expected: field.value, epoch: renderEpoch, bridgeEpoch, start: Number.isInteger(field.selectionStart) ? field.selectionStart : field.value.length, end: Number.isInteger(field.selectionEnd) ? field.selectionEnd : field.value.length, grammar: field.dataset.ikemenMapField, language: rawLanguage === 'cns' ? 'ikemen-cns' : rawLanguage } ; };
  const validTarget = value => keys(value, ['surface', 'id', 'expected', 'epoch', 'bridgeEpoch', 'start', 'end', 'grammar', 'language']) && value.surface === surface && typeof value.id === 'string' && bytes(value.id) > 0 && bytes(value.id) <= 256 && typeof value.expected === 'string' && bytes(value.expected) <= maxValue && integer(value.epoch, 0, 1e9) && integer(value.bridgeEpoch, 1, 1e9) && integer(value.start, 0, value.expected.length) && integer(value.end, value.start, value.expected.length) && ['code', 'expression', 'map-table', 'name'].includes(value.grammar) && ['zss', 'ikemen-cns'].includes(value.language);
  const fieldFor = proof => [...document.querySelectorAll('[data-ikemen-map-id]')].find(item => item.dataset.ikemenMapId === proof.id);
  const live = (field, proof) => !!field && eligible(field) === field && field.isConnected && renderEpoch === proof.epoch && bridgeEpoch === proof.bridgeEpoch && field.value === proof.expected && integer(field.selectionStart, 0, field.value.length) && integer(field.selectionEnd, field.selectionStart, field.value.length) && field.selectionStart === proof.start && field.selectionEnd === proof.end;
  const result = (requestId, epoch, ok, code) => vscode.postMessage({ type: 'ikemenMapInsertResult', requestId, bridgeEpoch: epoch, ok, code });
  for (const button of mapButtons) button.onclick = () => vscode.postMessage({ type: 'ikemenMaps', target: target() });
  addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'ikemenMapInsertPrepare') {
      if (!keys(message, ['type', 'requestId', 'bridgeEpoch', 'target', 'text']) || !integer(message.requestId, 1, Number.MAX_SAFE_INTEGER) || !integer(message.bridgeEpoch, 1, 1e9) || !validTarget(message.target) || message.target.bridgeEpoch !== message.bridgeEpoch || typeof message.text !== 'string' || bytes(message.text) > 65536 || pending.has(message.requestId)) return;
      const field = fieldFor(message.target), ok = live(field, message.target), code = ok ? 'ok' : 'stale'; if (ok) pending.set(message.requestId, { field, proof: message.target, text: message.text }); vscode.postMessage({ type: 'ikemenMapInsertReady', requestId: message.requestId, bridgeEpoch: message.bridgeEpoch, ok, code }); return;
    }
    if (message?.type === 'ikemenMapInsertAbort') { if (!keys(message, ['type', 'requestId', 'bridgeEpoch', 'code']) || !integer(message.requestId, 1, Number.MAX_SAFE_INTEGER) || !integer(message.bridgeEpoch, 1, 1e9) || !validCode(message.code)) return; const state = pending.get(message.requestId); if (state?.proof.bridgeEpoch === message.bridgeEpoch) pending.delete(message.requestId); return; }
    if (message?.type !== 'ikemenMapInsertCommit' || !keys(message, ['type', 'requestId', 'bridgeEpoch']) || !integer(message.requestId, 1, Number.MAX_SAFE_INTEGER) || !integer(message.bridgeEpoch, 1, 1e9)) return;
    const state = pending.get(message.requestId); if (!state || state.proof.bridgeEpoch !== message.bridgeEpoch) return;
    pending.delete(message.requestId); const { field, proof, text } = state;
    if (!live(field, proof)) { result(message.requestId, message.bridgeEpoch, false, 'stale'); return; }
    const original = field.value, predicted = original.slice(0, proof.start) + text + original.slice(proof.end);
    const rollbackOwn = () => { if (!field.isConnected || renderEpoch !== proof.epoch || bridgeEpoch !== proof.bridgeEpoch) return false; field.value = original; try { field.setSelectionRange(proof.start, proof.end); } catch (_) {} return field.value === original; };
    let dispatched = false;
    try { field.focus(); field.setRangeText(text, proof.start, proof.end, 'end'); if (field.value !== predicted) { rollbackOwn(); result(message.requestId, message.bridgeEpoch, false, 'write-failed'); return; } dispatched = true; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); if (field.value !== predicted) { result(message.requestId, message.bridgeEpoch, false, 'conflict'); return; } result(message.requestId, message.bridgeEpoch, true, 'ok'); } catch (_) { if (!dispatched) rollbackOwn(); result(message.requestId, message.bridgeEpoch, false, 'write-failed'); }
  });
}

function clientScript() { return `(${client.toString()})();`; }
module.exports = { clientScript };
