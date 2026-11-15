'use strict';
const crypto = require('node:crypto');
const reader = require('./sff_reader');
const { rewriteSpriteRows } = require('./sff_direct_delete');
const { encodedPlane } = require('./sff_sprite_transforms');

function hue(color) {
    const [r, g, b] = color, high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
    if (!delta) return 0;
    const sector = high === r ? (g - b) / delta : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    const angle=sector*60;
    return angle<0?angle+360:angle;
}

function sortSlots(colors, slots, criterion = 'hue', descending = false) {
    const selected = [...new Set(slots)].sort((a, b) => a - b);
    if (selected.length < 2 || selected.some(index => !Number.isInteger(index) || index < 1 || index >= colors.length)) throw new Error('Select at least two stored color slots. Transparent slot 0 stays locked.');
    if (!['hue', 'brightness'].includes(criterion)) throw new Error('Choose hue or brightness sorting.');
    const luma = color => .299 * color[0] + .587 * color[1] + .114 * color[2];
    const gray = color => color[0] === color[1] && color[1] === color[2];
    const value = color => criterion === 'brightness' || gray(color) ? luma(color) : hue(color);
    const ordered = selected.map(index => ({ index, color: colors[index] })).sort((a, b) => {
        if (criterion === 'hue' && gray(a.color) !== gray(b.color)) return gray(a.color) ? 1 : -1;
        return (descending ? -1 : 1) * (value(a.color) - value(b.color)) || a.index - b.index;
    });
    const result = colors.map(color => [...color]), mapping = Array.from({ length: 256 }, (_, index) => index);
    selected.forEach((destination, position) => {
        const source = ordered[position];
        result[destination] = [...source.color];
        mapping[source.index] = destination;
    });
    return { colors: result, mapping, selected };
}

function planPaletteSort(archive, paletteIndex, slots, criterion, descending = false) {
    if (archive.header.legacy) throw new Error('Palette sorting with pixel remapping requires SFF v2.');
    const owner = reader.resolvedPalette(archive, paletteIndex);
    if (!owner?.dataSize) throw new Error('Choose a stored palette.');
    const sorted = sortSlots(reader.paletteRgba(archive, paletteIndex), slots, criterion, descending);
    if (sorted.selected.some(index => index >= owner.colors)) throw new Error('Selected slot is outside this stored palette.');
    if (sorted.selected.every(index=>sorted.mapping[index]===index)) {
        return {...sorted,archive,buffer:archive.buffer,unchanged:true,paletteIndex,criterion,descending,changedSprites:[],changedPixels:0,materialized:[]};
    }
    const source = { ...archive, buffer: Buffer.from(archive.buffer) };
    sorted.colors.slice(0, owner.colors).forEach((color, index) => {
        const offset = archive.header.literalDataOffset + owner.dataOffset + index * 4;
        color.forEach((channel, at) => { source.buffer[offset + at] = channel; });
    });
    const groups = new Map(), changedSprites = [], materialized = [];
    let changedPixels = 0;
    const rows = [];
    for (const sprite of archive.sprites) {
        const row = { ...sprite, newIndex: sprite.index, data: sprite.dataSize ? Buffer.from(archive.buffer.subarray(sprite.dataOffset, sprite.dataOffset + sprite.dataSize)) : null };
        const image = reader.resolvedSprite(archive, sprite);
        if (image.colorDepth !== 5 && image.colorDepth !== 8) { rows.push(row); continue; }
        const affected = reader.resolvedPalette(archive, sprite.paletteIndex).index === owner.index;
        const key = `${image.index}:${affected}`;
        if (groups.has(key)) {
            row.data = null; row.dataSize = 0; row.link = groups.get(key);
            row.format = rows[row.link].format;
            row.colorDepth = rows[row.link].colorDepth;
        } else {
            groups.set(key, sprite.index);
            if (affected) {
                const plane = reader.spriteIndexPlane(archive, sprite), pixels = Buffer.from(plane.indices);
                for (let at = 0; at < pixels.length; at++) {
                    const mapped = sorted.mapping[pixels[at]];
                    if (mapped !== pixels[at]) changedPixels++;
                    pixels[at] = mapped;
                }
                const encoded = encodedPlane({ width: plane.width, height: plane.height, pixels, channels: 1 }, reader.friendlyVersion(archive.header.version) === '2.1' ? sorted.colors : null);
                Object.assign(row, encoded, { dataSize: encoded.data.length, link: 0 });
            } else {
                Object.assign(row, { data: Buffer.from(archive.buffer.subarray(image.dataOffset, image.dataOffset + image.dataSize)), dataSize: image.dataSize, format: image.format, colorDepth: image.colorDepth, link: 0 });
            }
            if (!sprite.dataSize) materialized.push(sprite.index);
        }
        if (affected) changedSprites.push(sprite.index);
        rows.push(row);
    }
    const result = rewriteSpriteRows(source, rows);
    for (const sprite of archive.sprites) {
        const before = require('./palette_index_organizer_model').decodePng(reader.spritePng(archive, sprite));
        const after = require('./palette_index_organizer_model').decodePng(reader.spritePng(result.archive, result.archive.sprites[sprite.index]));
        if (before.width !== after.width || before.height !== after.height || !before.rgba.equals(after.rgba)) throw new Error(`Palette sort changed rendered sprite ${sprite.group},${sprite.number}.`);
    }
    return { ...result, ...sorted, paletteIndex, criterion, descending, changedSprites, changedPixels, materialized, sourceHash: crypto.createHash('sha256').update(archive.buffer).digest('hex') };
}

module.exports = { hue, sortSlots, planPaletteSort };
