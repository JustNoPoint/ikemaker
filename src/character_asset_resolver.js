'use strict';

const fs = require('fs');
const path = require('path');

function inferCharacterFiles(airPath) {
  const { parseDef, sections, value } = require('./def_model');
  const { assignedPath } = require('./character_dependency_model');
  const directories = [];
  let current = path.dirname(airPath);
  for (let depth = 0; depth < 5; depth += 1) {
    directories.push(current);
    if (path.basename(current).toLowerCase() === 'chars') break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const matches=[];
  for (const directory of directories) {
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).filter((entry) => /\.def$/i.test(entry))) {
      const defPath = path.join(directory, name);
      let files;
      try { files = sections(parseDef(fs.readFileSync(defPath, 'utf8'), defPath), 'files')[0]; } catch (_) { continue; }
      if (!files) continue;
      const resolve = (key, alternate = '') => assignedPath(defPath, value(files, key, alternate ? value(files, alternate, '') : ''), key);
      if (!resolve('anim', 'air') || path.resolve(resolve('anim', 'air')).toLowerCase() !== path.resolve(airPath).toLowerCase()) continue;
      const sffPath = resolve('sprite', 'sff'), constantsPath = resolve('cns');
      const sourcePaths = [], seen = new Set();
      for (const entry of files.entries || []) {
        if (!/^(?:cns|st(?:common|\d*)?|cmd)$/i.test(entry.key)) continue;
        const filename = assignedPath(defPath, entry.value, entry.key), key = filename.toLowerCase();
        if (filename && !seen.has(key) && fs.existsSync(filename)) { seen.add(key); sourcePaths.push(filename); }
      }
      matches.push({ defPath, sffPath: sffPath && fs.existsSync(sffPath) ? sffPath : null, constantsPath: constantsPath && fs.existsSync(constantsPath) ? constantsPath : null, sourcePaths });
    }
  }
  const complete=matches.filter(item=>item.sffPath);
  return complete.length===1?complete[0]:!complete.length&&matches.length===1?matches[0]:null;
}

function inferSff(airPath) { return (inferCharacterFiles(airPath) || {}).sffPath || null; }

module.exports = { inferCharacterFiles, inferSff };
