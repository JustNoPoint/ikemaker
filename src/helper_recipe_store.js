'use strict';

const path = require('path');

function cleanName(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9 _.-]+/g, '').replace(/\s+/g, ' ').slice(0, 80);
}

function recipeDirectory(root) { return path.join(path.resolve(root), '.ikemen-tools', 'helper-recipes'); }
function recipeFilename(root, name) {
  const clean = cleanName(name); if (!clean) throw new Error('Enter a recipe name.');
  return path.join(recipeDirectory(root), `${clean.replace(/\s+/g, '-').toLowerCase()}.json`);
}
function recipeDocument(name, plan) { return { version: 1, name: cleanName(name), kind: 'ikemaker-helper-recipe', plan }; }
function list(fs, root) {
  const directory = recipeDirectory(root); if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => /\.json$/i.test(name)).map((name) => {
    const filename = path.join(directory, name);
    try { const data = JSON.parse(fs.readFileSync(filename, 'utf8')); return data?.kind === 'ikemaker-helper-recipe' && data?.plan ? { filename, name: cleanName(data.name) || path.basename(name, '.json'), plan: data.plan } : null; }
    catch (_) { return null; }
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { cleanName, recipeDirectory, recipeFilename, recipeDocument, list };
