'use strict';

const path = require('path');

const TEXT_GRAMMAR_KEY = 'ikemen.maps.textGrammar.v1';
const ZSS_EXTENSIONS = new Set(['.zss']);
const CNS_EXTENSIONS = new Set(['.cns', '.cmd', '.st', '.inp', '.jnp']);

function textGrammar(document, context) {
  if (['zss', 'ikemen-cns'].includes(document?.languageId)) return document.languageId;
  const extension = path.extname(document?.fileName || '').toLowerCase();
  if (ZSS_EXTENSIONS.has(extension)) return 'zss';
  if (CNS_EXTENSIONS.has(extension)) return 'ikemen-cns';
  if (extension !== '.txt') return '';
  return context?.workspaceState?.get(TEXT_GRAMMAR_KEY, {})?.[document?.uri?.toString?.()] || '';
}

function supportedNative(filename) { return ZSS_EXTENSIONS.has(path.extname(filename || '').toLowerCase()) || CNS_EXTENSIONS.has(path.extname(filename || '').toLowerCase()); }

module.exports = { TEXT_GRAMMAR_KEY, ZSS_EXTENSIONS, CNS_EXTENSIONS, textGrammar, supportedNative };
