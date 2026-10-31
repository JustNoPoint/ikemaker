'use strict';

const SETTING = 'RetryLoadOnError';

function lines(text) {
  const value = String(text ?? '');
  const eol = value.includes('\r\n') ? '\r\n' : '\n';
  return { value, eol, rows: value.split(/\r?\n/) };
}

function inspectRetryLoadOnError(text) {
  const { rows } = lines(text);
  let section = '', debugLine = -1;
  const assignments = [];
  rows.forEach((row, line) => {
    const heading = /^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/.exec(row);
    if (heading) { section = heading[1].trim().toLowerCase(); if (section === 'debug') debugLine = line; return; }
    if (section !== 'debug') return;
    const match = /^\s*RetryLoadOnError\s*=\s*([^;#]*?)\s*(?:[;#].*)?$/i.exec(row);
    if (!match) return;
    const raw = match[1].trim(), normalized = raw.toLowerCase();
    assignments.push({ line, raw, enabled: ['1', 'true', 'yes', 'on'].includes(normalized), valid: ['0', '1', 'true', 'false', 'yes', 'no', 'on', 'off'].includes(normalized) });
  });
  const active = assignments.at(-1);
  return Object.freeze({
    setting: SETTING,
    debugLine,
    assignments: Object.freeze(assignments),
    state: !active ? 'unset' : !active.valid ? 'invalid' : active.enabled ? 'enabled' : 'disabled',
    enabled: active?.valid ? active.enabled : null,
    line: active?.line ?? debugLine
  });
}

function planRetryLoadOnError(text, enabled) {
  const parsed = lines(text), inspection = inspectRetryLoadOnError(parsed.value);
  if (inspection.assignments.length > 1) return Object.freeze({ ok: false, reason: `The [Debug] section contains ${inspection.assignments.length} active ${SETTING} assignments. Resolve the duplicate settings manually first.`, inspection });
  const value = enabled ? '1' : '0', rows = [...parsed.rows];
  if (inspection.assignments.length === 1) {
    const line = inspection.assignments[0].line, source = rows[line], indent = /^\s*/.exec(source)?.[0] || '', suffix = /\s([;#].*)$/.exec(source)?.[1];
    rows[line] = `${indent}${SETTING} = ${value}${suffix ? ` ${suffix}` : ''}`;
    return Object.freeze({ ok: true, text: rows.join(parsed.eol), line, changed: rows[line] !== source, inspection });
  }
  if (inspection.debugLine >= 0) {
    let insertAt = inspection.debugLine + 1;
    while (insertAt < rows.length && !/^\s*\[/.test(rows[insertAt])) insertAt += 1;
    rows.splice(insertAt, 0, `${SETTING} = ${value}`);
    return Object.freeze({ ok: true, text: rows.join(parsed.eol), line: insertAt, changed: true, inspection });
  }
  const prefix = parsed.value && !parsed.value.endsWith('\n') && !parsed.value.endsWith('\r') ? parsed.eol : '';
  const suffix = `${prefix}[Debug]${parsed.eol}${SETTING} = ${value}${parsed.eol}`;
  return Object.freeze({ ok: true, text: parsed.value + suffix, line: rows.length + (prefix ? 1 : 0), changed: true, inspection });
}

module.exports = { SETTING, inspectRetryLoadOnError, planRetryLoadOnError };
