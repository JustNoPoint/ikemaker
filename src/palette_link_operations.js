'use strict';
const crypto = require('node:crypto');
const reader = require('./sff_reader');
const { rewriteSpriteRows } = require('./sff_direct_delete');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function duplicateGroups(archive) {
    if (archive.header.legacy) throw new Error('Palette links require SFF v2.');
    const groups = new Map();
    for (const palette of archive.palettes) {
        const owner = reader.resolvedPalette(archive, palette.index);
        if (!owner) throw new Error('A palette link has no stored owner.');
        const colors = reader.paletteRgba(archive, palette.index).slice(0, owner.colors);
        const key = JSON.stringify(colors);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(palette.index);
    }
    return [...groups.values()].filter(group => group.length > 1);
}

function rewrite(archive, palettes, map = new Map(archive.palettes.map(palette => [palette.index, palette.index])), buffer = archive.buffer) {
    const rows = archive.sprites.map(sprite => ({ ...sprite, newIndex: sprite.index, paletteIndex: [5,8].includes(reader.resolvedSprite(archive,sprite).colorDepth) ? map.get(sprite.paletteIndex) : sprite.paletteIndex, data: sprite.dataSize ? Buffer.from(archive.buffer.subarray(sprite.dataOffset, sprite.dataOffset + sprite.dataSize)) : null }));
    const built = rewriteSpriteRows({ ...archive, palettes, buffer }, rows);
    for (const sprite of archive.sprites) {
        if (!reader.spritePng(archive, sprite).equals(reader.spritePng(built.archive, built.archive.sprites[sprite.index]))) {
            const decode = require('./palette_index_organizer_model').decodePng;
            if (!decode(reader.spritePng(archive, sprite)).rgba.equals(decode(reader.spritePng(built.archive, built.archive.sprites[sprite.index])).rgba)) throw new Error('Palette sharing changed rendered sprite pixels.');
        }
    }
    return { ...built, sourceHash: sha(archive.buffer) };
}

function cleanup(archive, groups, mode) {
    const available = duplicateGroups(archive);
    if (!['link', 'merge'].includes(mode)) throw new Error('Choose duplicate linking or merging.');
    const redirects = new Map();
    for (const group of groups) {
        if (!available.some(valid => group.length === valid.length && group.every((index, at) => index === valid[at]))) throw new Error('Duplicate palette groups changed. Review again.');
        const owner = group[0];
        for (const index of group.slice(1)) redirects.set(index, owner);
    }
    if (!redirects.size) throw new Error('Choose at least one exact duplicate group.');
    // First physical row must own the table, including when it was itself
    // an alias. This keeps every newly authored link pointing backwards.
    const tables = [], palettes = archive.palettes.map(palette => ({ ...palette }));
    let length = archive.buffer.length;
    for (const group of groups) {
        const target = palettes[group[0]], owner = reader.resolvedPalette(archive, target.index);
        if (!target.dataSize) {
            const start = archive.header.literalDataOffset + owner.dataOffset, data = archive.buffer.subarray(start, start + owner.dataSize);
            Object.assign(target, { dataOffset: length - archive.header.literalDataOffset, dataSize: owner.dataSize, colors: owner.colors, link: 0 });
            tables.push(data); length += data.length;
        }
    }
    const buffer=tables.length?Buffer.concat([archive.buffer,...tables]):archive.buffer;
    if (mode === 'link') {
        for (const [index, target] of redirects) Object.assign(palettes[index], { dataOffset: 0, dataSize: 0, link: target, colors: palettes[target].colors });
        return { ...rewrite(archive, palettes, undefined, buffer), redirects: [...redirects], mode };
    }
    const kept = palettes.filter(palette => !redirects.has(palette.index)), positions = new Map(kept.map((palette, index) => [palette.index, index]));
    const map = new Map(archive.palettes.map(palette => [palette.index, positions.get(redirects.get(palette.index) ?? palette.index)]));
    const merged = kept.map(palette => ({ ...palette, index: positions.get(palette.index), link: map.get(palette.link) ?? 0 }));
    return { ...rewrite(archive, merged, map, buffer), redirects: [...redirects], mode };
}

function unlink(archive, selected) {
    if (archive.header.legacy) throw new Error('Palette unlink requires SFF v2.');
    const indices = [...new Set(selected)], parts = [archive.buffer], palettes = archive.palettes.map(palette => ({ ...palette }));
    let length = archive.buffer.length;
    for (const index of indices) {
        const palette = palettes[index];
        if (!palette || palette.dataSize) throw new Error('Choose linked palette rows to unlink.');
        const owner = reader.resolvedPalette(archive, index), start = archive.header.literalDataOffset + owner.dataOffset, bytes = archive.buffer.subarray(start, start + owner.dataSize);
        Object.assign(palette, { dataOffset: length - archive.header.literalDataOffset, dataSize: owner.dataSize, colors: owner.colors, link: 0 });
        parts.push(bytes); length += bytes.length;
    }
    if (!indices.length) throw new Error('Choose linked palette rows.');
    return { ...rewrite(archive, palettes, undefined, Buffer.concat(parts)), unlinked: indices };
}

module.exports = { duplicateGroups, cleanup, unlink };
