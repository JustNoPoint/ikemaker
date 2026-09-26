'use strict';

function identifier(value, fallback = 'ProjectUI_') {
  const cleaned = String(value || '').replace(/[^A-Za-z0-9_]/g, '');
  const safe = /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
  return safe || fallback;
}

function quote(value) { return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')}"`; }

function characterUiBridge(options = {}) {
  const prefix = identifier(options.prefix);
  const fightName = String(options.fightName || '').trim();
  const localCoord = Array.isArray(options.localCoord) ? options.localCoord : [320, 240];
  const message = String(options.message || 'ACTION');
  const checks = [];
  if (fightName) checks.push(`fightScreenVar(info.name) = ${quote(fightName)}`);
  if (localCoord[0]) checks.push(`fightScreenVar(info.localcoord.x) = ${Number(localCoord[0])}`);
  if (localCoord[1]) checks.push(`fightScreenVar(info.localcoord.y) = ${Number(localCoord[1])}`);
  return `# Optional character/project bridge for the configured fight screen.\n# Keep match-time conditions deterministic so the same code is rollback-safe.\n# Characters without this optional UI fall back to the ordinary fight screen.\n\n[Function ${prefix}IsCompatibleFightScreen() ret]\nlet ret = ${checks.join('\n    && ') || '1'};\n\n[Function ${prefix}ShowMessage(text; displayTime) ret]\nlet ret = 0;\nif call ${prefix}IsCompatibleFightScreen() {\n    lifebarAction{\n        text: text;\n        time: displayTime;\n        refreshtype: 2;\n    }\n    let ret = 1;\n}\n\n# Example call. Move the condition into the character/project system that owns the event.\n# if <event condition> {\n#     let shown = call ${prefix}ShowMessage(${quote(message)}; 60);\n# }\n`;
}

function previewProfile(options = {}) {
  return {
    version: 1,
    note: 'Editor-only sample data. This file does not add mandatory character metadata or runtime systems.',
    profiles: [{
      id: 'default', label: 'Default two-player preview',
      players: [
        { slot: 1, name: options.p1 || 'Player 1', life: 10000, power: 0, guard: 10000, stun: 0, redLife: 0, score: 0 },
        { slot: 2, name: options.p2 || 'Player 2', life: 10000, power: 0, guard: 10000, stun: 0, redLife: 0, score: 0 }
      ],
      timer: 99, combo: { hits: 3, damage: 1200 }, teamMode: 'Single', teamSize: 1
    }]
  };
}

module.exports = { identifier, characterUiBridge, previewProfile };
