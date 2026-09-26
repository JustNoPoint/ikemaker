'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const api = require(path.join(root, 'data', 'lua-api.json'));
const target = path.join(root, 'data', 'luals', 'ikemen-1.0.lua');

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function params(entry) {
  const match = String(entry.signature || '').match(/^[A-Za-z_][A-Za-z0-9_.]*\s*\((.*)\)$/);
  if (!match || !match[1].trim()) return [];
  return match[1].split(',').map((value) => value.trim()).filter(Boolean).map((value, index) => {
    if (value === '...') return '...';
    const name = value.replace(/[^A-Za-z0-9_]/g, '') || `arg${index + 1}`;
    return /^[A-Za-z_]/.test(name) ? name : `arg${index + 1}`;
  });
}

const functions = api.filter((entry) => entry.kind === 'function' && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(entry.name));
const tables = new Set();
for (const entry of functions) {
  const parts = entry.name.split('.');
  for (let index = 1; index < parts.length; index += 1) tables.add(parts.slice(0, index).join('.'));
}

const lines = [
  '---@meta IKEMEN_GO_1_0',
  '',
  '-- Generated from the locally archived official IKEMEN GO 1.0 Lua API.',
  '-- This file exists for Lua Language Server analysis and is never executed by IKEMEN.',
  ''
];
for (const table of [...tables].sort((a, b) => a.localeCompare(b))) lines.push(`${table} = ${table} or {}`);
lines.push('');
for (const entry of functions) {
  const names = params(entry);
  lines.push(`---${clean(entry.description)}`);
  lines.push(`---Source: ${entry.url}`);
  for (const name of names) lines.push(name === '...' ? '---@vararg any' : `---@param ${name} any`);
  if (entry.returns && !/^\s*(?:none)?\s*$/i.test(entry.returns)) lines.push(`---@return any result ${clean(entry.returns)}`);
  lines.push(`function ${entry.name}(${names.join(', ')}) end`, '');
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
console.log(`${target} (${functions.length} functions)`);
