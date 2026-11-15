'use strict';
const crypto = require('node:crypto');
const reader = require('./sff_reader');
const merge = require('./palette_merge');
const { rewriteSpriteRows } = require('./sff_direct_delete');
const { encodedPlane } = require('./sff_sprite_transforms');
const { decodePng } = require('./palette_index_organizer_model');

function prepare(archive, selected, targetIndex, options = {}) {
    if (archive.header.legacy) throw new Error('Embedded palette merge requires SFF v2.');
    const indices = [...new Set(selected)].sort((left, right) => left - right);
    if (indices.length < 2 || indices.length > 32 || indices.some(index => !Number.isInteger(index) || !archive.palettes[index])) throw new Error('Choose 2 through 32 embedded palettes.');
    if (!indices.includes(targetIndex) || !archive.palettes[targetIndex].dataSize) throw new Error('The target must be a selected stored palette.');
    const ordered = [targetIndex, ...indices.filter(index => index !== targetIndex)], chosen = new Set(indices);
    const sourceOf = sprite => chosen.has(sprite.paletteIndex) ? sprite.paletteIndex : ordered.find(index => reader.resolvedPalette(archive, sprite.paletteIndex)?.index === index);
    const users = new Map(), weights = new Map(ordered.map(index => [index, Array(256).fill(0)]));
    for (const sprite of archive.sprites) {
        const owner = reader.resolvedSprite(archive, sprite);
        if (![5,8].includes(owner.colorDepth)) continue;
        if (!users.has(owner.index)) users.set(owner.index, []);
        users.get(owner.index).push(sprite);
    }
    const owners = [];
    for (const [ownerIndex, members] of users) {
        if (!members.some(sprite => sourceOf(sprite) !== undefined)) continue;
        const owner = archive.sprites[ownerIndex], sourceIndex = sourceOf(owner);
        if (sourceIndex === undefined || members.some(sprite => sourceOf(sprite) === undefined)) {
            if (options.combine) continue;
            throw new Error(`Sprite image ${owner.group},${owner.number} is shared with an unselected palette. Select every palette using this image before merging.`);
        }
        const plane = reader.spriteIndexPlane(archive, owner);
        if (plane.width * plane.height > 4000000) throw new Error('A merge image exceeds four million pixels.');
        const families = new Map();
        for (const member of members) {
            const index = sourceOf(member);
            if (!families.has(index)) families.set(index, []);
            families.get(index).push(member);
        }
        for (const [index, family] of families) {
            for (const pixel of plane.indices) weights.get(index)[pixel]++;
            owners.push({owner:family[0], sourceIndex:index, plane, members:family, originalImage:owner.index});
        }
    }
    const sources = ordered.map(index => {
        const colors = reader.paletteRgba(archive, index).slice(0, reader.resolvedPalette(archive, index).colors), start = merge.paddingStart(colors);
        return { colors, weights: weights.get(index), skip: colors.map((_, slot) => slot > 0 && slot >= start && !(options.keepUsed !== false && weights.get(index)[slot] > 0)) };
    });
    const result = merge.build(sources, options.fill || [0, 0, 0, 255]);
    return { ...result, ordered, owners, sources, targetIndex, excludedPadding: sources.reduce((sum, source) => sum + source.skip.filter(Boolean).length, 0) };
}

function planMerge(archive, selected, targetIndex, options = {}) {
    const plan = prepare(archive, selected, targetIndex, { ...options, keepUsed: true });
    if (plan.reduced) throw new Error(`These palettes contain ${plan.uniqueColors + 1} colors including the mask. Embedded merge accepts at most 256; Combine Into New can reduce a temporary copy.`);
    const removed = new Set(plan.ordered.filter(index => index !== targetIndex));
    const kept = archive.palettes.filter(palette => !removed.has(palette.index));
    const newIndex = new Map(kept.map((palette, index) => [palette.index, index]));
    const targetAfter = newIndex.get(targetIndex), colors = plan.colors;
    const colorBytes = Buffer.from(colors.flat());
    const source = { ...archive, buffer: Buffer.concat([archive.buffer, colorBytes]), palettes: kept.map(palette => ({ ...palette, index: newIndex.get(palette.index), link: removed.has(palette.link) ? targetAfter : newIndex.get(palette.link) ?? 0 })) };
    Object.assign(source.palettes[targetAfter], { colors: colors.length, dataOffset: archive.buffer.length - archive.header.literalDataOffset, dataSize: colorBytes.length, link: 0 });
    const rows = archive.sprites.map(sprite => {
        const indexed = [5,8].includes(reader.resolvedSprite(archive,sprite).colorDepth);
        const paletteIndex = indexed ? (removed.has(sprite.paletteIndex) ? targetAfter : newIndex.get(sprite.paletteIndex)) : sprite.paletteIndex;
        return {...sprite,newIndex:sprite.index,data:sprite.dataSize?Buffer.from(archive.buffer.subarray(sprite.dataOffset,sprite.dataOffset+sprite.dataSize)):null,paletteIndex};
    });
    let changedPixels = 0;
    const mappedImages = new Map();
    for (const { owner, sourceIndex, plane, members, originalImage } of plan.owners) {
        const map = plan.maps[plan.ordered.indexOf(sourceIndex)], pixels = Buffer.from(plane.indices);
        for (let at = 0; at < pixels.length; at++) { if (pixels[at] !== map[pixels[at]]) changedPixels++; pixels[at] = map[pixels[at]]; }
        const key = originalImage + ':' + crypto.createHash('sha256').update(pixels).digest('hex');
        let stored = mappedImages.get(key);
        if (!stored) {
            const encoded = encodedPlane({width:plane.width,height:plane.height,pixels,channels:1,colorDepth:8},reader.friendlyVersion(archive.header.version)==='2.1'?colors:null);
            stored = rows[owner.index];
            Object.assign(stored,encoded,{dataSize:encoded.data.length,link:0});
            mappedImages.set(key,stored);
        }
        for (const member of members) {
            rows[member.index].paletteIndex = targetAfter;
            if (member.index !== stored.index) Object.assign(rows[member.index], {data:null,dataSize:0,link:stored.index,format:stored.format,colorDepth:8});
        }
    }
    const built = rewriteSpriteRows(source, rows);
    let changedRenderedPixels = 0;
    for (const sprite of archive.sprites) {
        const before = decodePng(reader.spritePng(archive, sprite)), after = decodePng(reader.spritePng(built.archive, built.archive.sprites[sprite.index]));
        for (let at = 0; at < before.rgba.length; at += 4) if (!before.rgba.subarray(at, at + 4).equals(after.rgba.subarray(at, at + 4))) changedRenderedPixels++;
    }
    return { ...plan, ...built, changedPixels, changedRenderedPixels, removed: [...removed], sourceHash: crypto.createHash('sha256').update(archive.buffer).digest('hex') };
}

module.exports = { prepare, planMerge };
