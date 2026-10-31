'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWriteSet } = require('./mutation_safety');

const MODULE_RELATIVE = 'external/mods/IKEMaker_quick_music.lua';

function luaString(value) {
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n')}'`;
}

function runtimeLua() {
  return `-- IKEMaker Quick VS / Training music bridge.
-- This stable bridge is inert unless an IKEMaker-specific launch flag is present.
hook.add('main.f_commandLine', 'IKEMaker_quick_music', function(_, flags, _, _, _, params)
\tlocal music = flags['-ikemaker.music']
\tif music == nil or music == '' then return end
\tlocal volume = tonumber(flags['-ikemaker.music-volume']) or 100
\tlocal loopStart = tonumber(flags['-ikemaker.music-loopstart']) or 0
\tlocal loopEnd = tonumber(flags['-ikemaker.music-loopend']) or 0
\tlocal value = tostring(music) .. ' ' .. tostring(volume) .. ' ' .. tostring(loopStart) .. ' ' .. tostring(loopEnd)
\t-- IKEMEN applies launch music candidates by index. Repeating the exact test
\t-- track replaces authored random-pool entries without changing source files.
\tfor _ = 1, 1024 do table.insert(params, 'music=' .. value) end
end)
`;
}

function install(root) {
  const filename = path.join(root, ...MODULE_RELATIVE.split('/'));
  const content = runtimeLua();
  if (fs.existsSync(filename) && fs.readFileSync(filename, 'utf8') === content) return filename;
  transactionalWriteSet(fs, [[filename, content]], { label: 'install-quick-launch-music-bridge', journalRoot: root, backup: false, journal: false, allowExisting: true });
  return filename;
}

function remove(root) {
  const filename = path.join(root, ...MODULE_RELATIVE.split('/'));
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
}

module.exports = { MODULE_RELATIVE, luaString, runtimeLua, install, remove };
