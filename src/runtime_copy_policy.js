'use strict';

// Reserved development locations, not file extensions: TXT/DAT/Lua/JSON,
// licenses and game-specific documentation can be runtime dependencies.
const supportSegments = new Set(['.git', '.vscode', '.agents', '.codex',
  '.codex-remote-attachments', '.pnpm-store', 'node_modules', '__pycache__',
  '_development', 'development', '.tmp', 'tmp', '_backup', 'backups']);
const templateSupport = new Set(['notes', 'reference', 'outputs', 'archive',
  'tools', '.rc2-update', 'sf6sprites_sprmake_bgr', 'sf6sprites_truecolor',
  'sf6sounds', 'sf6sounds_original', 'shadows', 'shadows_alternative']);

function runtimeCopyAllowed(relative) {
  const parts = String(relative || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase().split('/').filter(Boolean);
  if (!parts.length) return true;
  if (parts.some(part => supportSegments.has(part))) return false;
  if (parts[0] === 'chars' && parts[1] === 'template' && templateSupport.has(parts[2])) return false;
  if (parts[0] === 'chars' && parts[1] === 'ryu' && parts[2] === 'sound_sources') return false;
  if (/^(?:builder-rehearsal|crop-ui-rehearsal|sff-viewer-audit|shared-viewer-audit|ikemaker-audit|ikemaker-tester-preview)(?:-|$)/.test(parts[0])) return false;
  if (['character assets', 'vselect', 'sf6-test-project'].includes(parts[0])) return false;
  if (parts.length === 1 && (/\.(?:zip|rar|7z|vsix|code-workspace)$/i.test(parts[0]) || /^(?:ikemen_go\d+|screenshot_).*\.(?:png|jpe?g)$/i.test(parts[0]))) return false;
  return true;
}

function nestedGame(fs, directory, relative) {
  if (!relative || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return false;
  // A whole second game is not a dependency of the enclosing game.
  if (!fs.existsSync(require('path').join(directory, 'chars')) || !fs.existsSync(require('path').join(directory, 'data'))) return false;
  return fs.readdirSync(directory, { withFileTypes: true }).some(entry => entry.isFile() && /^(?:ikemen.*|hdbz.*|mugen)\.exe$/i.test(entry.name));
}

module.exports = { runtimeCopyAllowed, nestedGame };
