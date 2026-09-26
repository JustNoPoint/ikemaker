'use strict';

function n(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function pair(value, fallback = [0, 0]) { return Array.isArray(value) && value.length >= 2 ? [n(value[0]), n(value[1])] : fallback; }
function block(name, fields) { return `${name} {\n${fields.filter(Boolean).map((line) => `\t${line}`).join('\n')}\n}`; }

const SPRITE_CONTROLLERS = {
  offset: 'Draw the player away from the SFF axis without changing its position or sprite data.',
  remappal: 'Map one embedded SFF palette identity to another.',
  remapsprite: 'Replace one SFF sprite identity with another at draw time.',
  remapspritepreset: 'Apply a named RemapPreset declared by the character.',
  changeanim: 'Play an AIR action whose frames refer to sprites in this SFF.',
  explod: 'Create a visual using an AIR action; use RemapPal on the Explod when needed.'
};

function spriteSnippet(kind, options = {}) {
  const sprite = pair(options.sprite), destination = pair(options.destination, [sprite[0], sprite[1] + 1]), sourcePalette = pair(options.sourcePalette, [1, 1]), destPalette = pair(options.destPalette, [1, 2]);
  switch (kind) {
    case 'offset': return block('offset', [`x: ${n(options.x)};`, `y: ${n(options.y)};`]);
    case 'remappal': return block('remapPal', [`source: ${sourcePalette.join(', ')};`, `dest: ${destPalette.join(', ')};`]);
    case 'remapsprite': return block('remapSprite', [`source: ${sprite.join(', ')};`, `dest: ${destination.join(', ')};`]);
    case 'remapspritepreset': return block('remapSprite', [`preset: "${String(options.preset || 'Form1')}";`, 'reset: 1;']);
    case 'changeanim': return block('changeAnim', [`value: ${n(options.action, sprite[0])};`, `elem: ${Math.max(1, n(options.element, 1))};`]);
    case 'explod': return block('explod', [`anim: ${n(options.action, sprite[0])};`, 'id: 0;', 'pos: 0, 0;', 'postype: p1;', 'ownpal: true;']);
    default: throw new Error(`Unknown sprite controller bridge: ${kind}`);
  }
}

const SOUND_CONTROLLERS = {
  playsnd: 'Play the selected SND entry. Supports split-archive prefixes.',
  modifysnd: 'Change a sound already playing on a channel, including pitch, volume, pan, loop data, and stop behavior.',
  sndpan: 'Move a playing channel through the stereo field.',
  stopsnd: 'Stop the sound currently playing on a channel.',
  playbgm: 'Start music from a file or native music source.',
  modifybgm: 'Modify current music volume, frequency, loop points, or position.',
  bgmvar: 'Read current music metadata through native BGMVar triggers.'
};

function soundValue(options) { const id = pair(options.sound); return `${String(options.prefix || 'S')}${id[0]}, ${id[1]}`; }
function soundSnippet(kind, options = {}) {
  const channel = n(options.channel, 1), freqmul = n(options.freqmul, 1), volume = n(options.volume, 100), pan = n(options.pan, 0);
  switch (kind) {
    case 'playsnd': return block('playSnd', [`value: ${soundValue(options)};`, `channel: ${channel};`, `volumescale: ${volume};`, `freqmul: ${freqmul};`, `pan: ${pan};`]);
    case 'modifysnd': return block('modifySnd', [`channel: ${channel};`, `volumescale: ${volume};`, `freqmul: ${freqmul};`, `pan: ${pan};`]);
    case 'sndpan': return block('sndPan', [`channel: ${channel};`, `pan: ${pan};`]);
    case 'stopsnd': return block('stopSnd', [`channel: ${channel};`]);
    case 'playbgm': return block('playBgm', [`bgm: "${String(options.bgm || 'sound/music.ogg')}";`, `volume: ${volume};`, `freqmul: ${freqmul};`, 'loop: 1;']);
    case 'modifybgm': return block('modifyBgm', [`volume: ${volume};`, `freqmul: ${freqmul};`, `position: ${n(options.position, 0)};`]);
    case 'bgmvar': return ['# Native BGMVar associations (use these directly in triggers/expressions)', '# BGMVar(filename)      # string', '# BGMVar(position)      # samples', '# BGMVar(length)        # samples', '# BGMVar(startposition)', '# BGMVar(loop)', '# BGMVar(loopcount)', '# BGMVar(loopstart)', '# BGMVar(loopend)', '# BGMVar(volume)'].join('\n');
    default: throw new Error(`Unknown sound controller bridge: ${kind}`);
  }
}

module.exports = { SPRITE_CONTROLLERS, SOUND_CONTROLLERS, spriteSnippet, soundSnippet };
