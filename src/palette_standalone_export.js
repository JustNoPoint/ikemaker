'use strict';
const scratch = require('./palette_scratch_document');
const {encodeIndexedPng} = require('./palette_indexed_png');

function sourceColors(value) {
    const document = scratch.normalizeScratchPaletteDocument(value);
    const colors = scratch.actExportColors(document);
    let count = document.textSource?.count || 256;
    for (let i = count; i < 256; i++) {
        if (colors[i].some((channel, c) => channel !== (c === 3 ? 255 : 0))) count = i + 1;
    }
    return {colors, count};
}
function palettePng(value) {
    const {colors, count} = sourceColors(value);
    const width = Math.min(16, count), height = Math.ceil(count / width);
    // Repeat the final swatch in the last partial row without inventing palette entries.
    const indices = Buffer.from(Array.from({length: width * height}, (_,i) => Math.min(i, count - 1)));
    return encodeIndexedPng({width, height}, indices, colors, {paletteCount: count});
}
module.exports = {sourceColors, palettePng};

function actLayouts(value) {
    const document = scratch.normalizeScratchPaletteDocument(value);
    const retained = document.textSource?.act;
    const layouts = [];
    if (retained) layouts.push({label: 'Original ACT layout', description: 'Retain source order, count trailer and unused RGB bytes', order: retained.order, trailer: Buffer.from(retained.bytes, 'base64').length === 772, original: true});
    return [...layouts,
        {label: 'ACT file order · 768 bytes', description: 'Index 0 first; 256 RGB entries', order: 'index', trailer: false},
        {label: 'Classic M.U.G.E.N / Ikemen GO · 768 bytes', description: 'Index 255 first; short palettes pad to 256 colors', order: 'reversed', trailer: false},
        {label: 'Modern Photoshop / Aseprite · 772 bytes', description: 'Index 0 first; retains short count and one transparent index', order: 'index', trailer: true}];
}
function paletteAct(value, layout) {
    const document = scratch.normalizeScratchPaletteDocument(value);
    const {colors, count} = sourceColors(document);
    if (!layout || !['index','reversed'].includes(layout.order) || typeof layout.trailer !== 'boolean') throw Error('Choose a valid ACT layout.');
    const retained = document.textSource?.act;
    const original = layout.original && retained ? Buffer.from(retained.bytes, 'base64') : null;
    const output = original ? Buffer.from(original) : Buffer.alloc(layout.trailer ? 772 : 768);
    if (output.length !== (layout.trailer ? 772 : 768)) throw Error('The original ACT layout changed.');
    const zeros = colors.slice(0,count).map((color,index) => color[3] === 0 ? index : -1).filter(index => index >= 0);
    const alphaLoss = colors.slice(0,count).some((color,index) => layout.trailer ? color[3] !== 255 && color[3] !== 0 : color[3] !== (index === 0 ? 0 : 255));
    if (alphaLoss || layout.trailer && zeros.length > 1) throw Error('This ACT layout cannot preserve the palette alpha. Export indexed PNG or RGBA instead.');
    for (let i=0;i<256;i++) {
        // Entries outside the new count still belong to the original file.
        if (original && i>=count) continue;
        const color = i<count ? colors[i] : [0,0,0,255];
        const at = (layout.order === 'reversed' ? 255-i : i)*3;
        for(let channel=0;channel<3;channel++) output[at+channel]=color[channel];
    }
    if (layout.trailer) {
        const transparent = zeros.length ? zeros[0] : 65535;
        const storedCount=original && count===256 && original.readUInt16BE(768)===0 ? 0 : count;
        output.writeUInt16BE(storedCount,768);
        output.writeUInt16BE(transparent,770);
    }
    return {bytes: output, count, padded: layout.trailer ? 0 : 256-count};
}
module.exports.actLayouts = actLayouts;
module.exports.paletteAct = paletteAct;
