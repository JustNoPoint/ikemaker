'use strict';
const fs = require('fs');
const path = require('path');

async function chooseLaunchStage(root, preferred, pick) {
  const candidate = path.resolve(root, preferred || '');
  if (preferred && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return preferred;
  const stages = [];
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && /\.def$/i.test(entry.name)) stages.push(path.relative(root, filename).replace(/\\/g, '/'));
    }
  }
  visit(path.join(root, 'stages'));
  const choices = stages.sort().map(stage => ({ label: stage, stage }));
  const selected = await pick(choices, {
    title: 'Choose a stage for this game',
    placeHolder: choices.length ? 'The configured stage is unavailable here. Choose a stage from this game.' : 'No stage DEF files were found in this game. Add a stage before launching.'
  });
  return selected?.stage || null;
}
module.exports = { chooseLaunchStage };
