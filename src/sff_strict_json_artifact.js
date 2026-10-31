'use strict';

const { TextDecoder } = require('util');

function rejectDuplicateJsonKeys(text) {
  let at = 0;
  const whitespace = () => { while (/\s/.test(text[at] || '')) at += 1; };
  const string = () => {
    whitespace(); const start = at;
    if (text[at++] !== '"') throw new Error(`Expected JSON string at byte ${start}.`);
    while (at < text.length) {
      if (text[at] === '\\') { at += 2; continue; }
      if (text[at++] === '"') return JSON.parse(text.slice(start, at));
    }
    throw new Error('Unterminated JSON string.');
  };
  const value = () => {
    whitespace();
    if (text[at] === '{') return object();
    if (text[at] === '[') return array();
    if (text[at] === '"') { string(); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (!match) throw new Error(`Invalid JSON value at byte ${at}.`);
    at += match[0].length;
  };
  const object = () => {
    at += 1; whitespace(); const keys = new Set();
    if (text[at] === '}') { at += 1; return; }
    while (true) {
      const key = string();
      if (keys.has(key)) throw new Error(`Duplicate JSON object key ${key}.`);
      if (key === '__proto__') throw new Error('JSON object key __proto__ is not allowed in sealed artifacts.');
      keys.add(key); whitespace(); if (text[at++] !== ':') throw new Error(`Expected JSON colon at byte ${at - 1}.`);
      value(); whitespace();
      if (text[at] === '}') { at += 1; return; }
      if (text[at++] !== ',') throw new Error(`Expected JSON comma at byte ${at - 1}.`);
    }
  };
  const array = () => {
    at += 1; whitespace(); if (text[at] === ']') { at += 1; return; }
    while (true) { value(); whitespace(); if (text[at] === ']') { at += 1; return; } if (text[at++] !== ',') throw new Error(`Expected JSON comma at byte ${at - 1}.`); }
  };
  value(); whitespace(); if (at !== text.length) throw new Error(`Unexpected JSON content at byte ${at}.`);
}

function decodeStrictJsonArtifact(value, label = 'JSON artifact') {
  if (!Buffer.isBuffer(value) && typeof value !== 'string') throw new Error(`${label} exact bytes are required.`);
  const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, 'utf8');
  let text, parsed;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); rejectDuplicateJsonKeys(text); parsed = JSON.parse(text); }
  catch (error) { throw new Error(`${label} is not strict JSON: ${error.message}`); }
  const finite = (item, path = label) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error(`${path} must contain only finite JSON numbers.`);
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) item.forEach((child, index) => finite(child, `${path}[${index}]`));
    else for (const [key, child] of Object.entries(item)) finite(child, `${path}.${key}`);
  };
  finite(parsed);
  return { bytes, text, parsed };
}

module.exports = { rejectDuplicateJsonKeys, decodeStrictJsonArtifact };
