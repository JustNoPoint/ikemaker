'use strict';

const fs = require('fs');
const path = require('path');

function inferCharacterFiles(airPath) {
  const cleanReference = (value) => value.split(';')[0].trim().replace(/^['"]|['"]$/g, '');
  const directories = [];
  let current = path.dirname(airPath);
  for (let depth = 0; depth < 5; depth += 1) {
    directories.push(current);
    if (path.basename(current).toLowerCase() === 'chars') break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const directory of directories) {
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).filter((entry) => /\.def$/i.test(entry))) {
      const defPath = path.join(directory, name), text = fs.readFileSync(defPath, 'utf8'), anim = /^\s*(?:anim|air)\s*=\s*(.+?)\s*$/im.exec(text);
      if (!anim || path.resolve(directory, cleanReference(anim[1])).toLowerCase() !== path.resolve(airPath).toLowerCase()) continue;
      const sprite = /^\s*(?:sprite|sff)\s*=\s*(.+?)\s*$/im.exec(text), cns = /^\s*cns\s*=\s*(.+?)\s*$/im.exec(text);
      const sffPath = sprite && path.resolve(directory, cleanReference(sprite[1])), constantsPath = cns && path.resolve(directory, cleanReference(cns[1]));
      const sourcePaths = [], seen = new Set();
      for (const match of text.matchAll(/^\s*(?:cns|st(?:common|\d*)?|cmd)\s*=\s*(.+?)\s*$/gim)) {
        const filename = path.resolve(directory, cleanReference(match[1])), key = filename.toLowerCase();
        if (!seen.has(key) && fs.existsSync(filename)) { seen.add(key); sourcePaths.push(filename); }
      }
      if (sffPath && fs.existsSync(sffPath)) return { defPath, sffPath, constantsPath: constantsPath && fs.existsSync(constantsPath) ? constantsPath : null, sourcePaths };
    }
  }
  return null;
}

function inferSff(airPath) { return (inferCharacterFiles(airPath) || {}).sffPath || null; }

module.exports = { inferCharacterFiles, inferSff };
