'use strict';

const fs = require('fs');
const path = require('path');

const STORAGE_KEY = 'ikemenZss.recentFolders.v1';
let storage = null;
let folders = {};

function validFolders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, folder]) => typeof key === 'string' && typeof folder === 'string' && folder.trim()));
}

function configure(context) {
  storage = context && context.globalState;
  folders = validFolders(storage && storage.get(STORAGE_KEY, {}));
}

function existingFolder(key, fsApi = fs) {
  const folder = folders[String(key)] || '';
  if (!folder) return '';
  try { return fsApi.statSync(folder).isDirectory() ? folder : ''; }
  catch (_) { return ''; }
}

function selectedFolder(selection, fsApi = fs) {
  const filename = selection && selection[0] && selection[0].fsPath;
  if (!filename) return '';
  try { return fsApi.statSync(filename).isDirectory() ? filename : path.dirname(filename); }
  catch (_) { return path.dirname(filename); }
}

async function rememberSelection(key, selection, fsApi = fs) {
  const folder = selectedFolder(selection, fsApi);
  if (!folder) return false;
  folders = { ...folders, [String(key)]: folder };
  try {
    if (storage && typeof storage.update === 'function') await storage.update(STORAGE_KEY, folders);
    return true;
  } catch (_) { return false; }
}

function defaultUri(api, key, fsApi = fs) {
  const folder = existingFolder(key, fsApi);
  return folder && api && api.Uri && typeof api.Uri.file === 'function' ? api.Uri.file(folder) : undefined;
}

module.exports = { STORAGE_KEY, configure, existingFolder, selectedFolder, rememberSelection, defaultUri };
