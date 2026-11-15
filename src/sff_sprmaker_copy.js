'use strict';
const crypto = require('node:crypto');
const reader = require('./sff_reader');
const { pixelPlane } = require('./sff_sprite_transforms');
const { readIndexedPng8 } = require('./sff_png8_source');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function build(archive) {
    if (archive.header.legacy) throw Error('SprMaker-compatible SFF v1 writing is not available. V1 preview, axis edits, sprite export and transfer remain available.');
    if (!archive.sprites.length || archive.sprites.length > 4096) throw Error('This compatible-copy profile supports 1–4096 sprites.');
    let total = 0;
    const decodedPixelsByEntryId = {};
    const sprites = archive.sprites.map(sprite => {
        const resolved = reader.resolvedSprite(archive,sprite);
        if (resolved.colorDepth !== 8) throw Error('This compatible-copy profile requires indexed 8-bit sprites. Truecolor and 5-bit source archives require another reviewed writer profile.');
        total += resolved.width * resolved.height;
        if (resolved.width * resolved.height > 1000000 || total > 16000000) throw Error('Compatible copy is limited to one million pixels per sprite and 16 million total.');
        const plane = pixelPlane(archive, sprite);
        if (plane.channels !== 1 || plane.colorDepth !== 8) throw Error('This compatible-copy profile requires indexed 8-bit sprites. Truecolor and 5-bit source archives require another reviewed writer profile.');
        const entryId = 'sprite:' + sprite.index, png = require('./sff_palette_remap').encodeIndexed(plane.width,plane.height,plane.pixels,reader.paletteRgba(archive,sprite.paletteIndex)), decoded = readIndexedPng8(png);
        decodedPixelsByEntryId[entryId] = plane.pixels;
        return {
            entryId, group:sprite.group, number:sprite.number, width:plane.width, height:plane.height,
            axisX:sprite.axisX, axisY:sprite.axisY, paletteEntryId:'palette:' + sprite.paletteIndex,
            ...(sprite.dataSize ? {} : {contentLinkTargetEntryId:'sprite:' + sprite.link}),
            pixels:{kind:'indexed8',decodedHash:decoded.decodedHash},
            source:{relativePath:'sprite-' + sprite.index + '.png',byteHash:digest(png),decodedHash:decoded.decodedHash}
        };
    });
    const palettes = archive.palettes.map(palette => {
        const owner = reader.resolvedPalette(archive,palette.index);
        if (!owner || owner.colors !== 256 || owner.dataSize !== 1024 || palette.colors !== 256) throw Error('This compatible-copy profile requires a full 256-color palette at each palette slot.');
        const colors = reader.paletteRgba(archive,palette.index);
        if (colors.length !== 256 || colors.some((color,index) => color[3] !== (index ? 255 : 0))) throw Error('This compatible-copy profile requires 256-color palettes with transparent index 0 and opaque remaining slots. Palette alpha is never discarded.');
        return {
            entryId:'palette:' + palette.index, group:palette.group, number:palette.number, colors,
            source:{relativePath:'palette-' + palette.index + '.rgba',byteHash:digest(Buffer.from(colors.flat())),decodedHash:digest(Buffer.from(colors.flat()))},
            ...(palette.dataSize ? {} : {contentLinkTargetEntryId:'palette:' + palette.link})
        };
    });
    const specification = require('./sff_build_specification_v2').createSffBuildSpecificationV2({
        planId:'sprmaker-compatible-copy', selection:{targetId:'sff-v2.0',backendId:'ikemaker-builtin-sff-v2.0'},
        archive:{identity:'compatible-copy.sff'}, logical:{sourceRoot:'input',sprites,palettes},
        encodingIntent:{compression:{default:'raw8'},crop:{default:'none'},storage:{},paletteMode:'embedded',backendOptions:{}}
    });
    const bytes = require('./sff_v20_raw8_writer').createSffV20Raw8Bytes(specification,{decodedPixelsByEntryId});
    const result = reader.parseSffBuffer(bytes);
    for (let index=0;index<sprites.length;index++) {
        const before=archive.sprites[index], after=result.sprites[index];
        if (['group','number','width','height','axisX','axisY','paletteIndex','link'].some(key=>before[key]!==after[key]) || Boolean(before.dataSize)!==Boolean(after.dataSize) || !decodedPixelsByEntryId[sprites[index].entryId].equals(pixelPlane(result,after).pixels)) throw Error('Compatible-copy verification changed a sprite identity, axis, palette, link or index plane.');
    }
    for (const [index,before] of archive.palettes.entries()) {
        const after = result.palettes[index];
        if (!after || ['group','number','colors','link'].some(key=>before[key]!==after[key]) ||
            Boolean(before.dataSize)!==Boolean(after.dataSize) ||
            JSON.stringify(palettes[index].colors)!==JSON.stringify(reader.paletteRgba(result,index))) {
            throw Error('Compatible-copy verification changed palette identity, colors or ownership.');
        }
    }
    return {bytes,archive:result,sourceHash:digest(archive.buffer),profile:'SprMaker 2.01 compatible SFF 2.0.1.0 · RAW8 · preserve crop and ownership',spriteCount:sprites.length,paletteCount:palettes.length};
}
module.exports = {build:(archive,options)=>options===undefined?build(archive):require('./sff_sprmaker_201_copy').build(archive,options),buildRaw8:build,DEFAULTS:require('./sff_sprmaker_201_copy').DEFAULTS};
