'use strict';

const RGBA_COMMENT = '# RGBA palette; colors are listed by index as R G B A values from 0 to 255.';

function parsePaletteText(bytes) {
  if (bytes.length > 32768) throw Error('Palette text exceeds 32 KB.');
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const rgba = lines[0] === RGBA_COMMENT && lines[1] === 'IKEMEN-RGBA' && lines[2] === '1';
  if (!rgba && !(lines[0] === 'JASC-PAL' && lines[1] === '0100')) throw Error('Unrecognized palette header or version.');
  const first = rgba ? 4 : 3, count = Number(lines[first-1]);
  if (!/^\d+$/.test(lines[first-1]) || count < 1 || count > 256 || lines.length !== first + count) throw Error('Palette count must match 1?256 color rows.');
  return lines.slice(first).map((row,index) => {
    const values = row.trim().split(/\s+/);
    if (values.length !== (rgba ? 4 : 3) || values.some(v => !/^\d+$/.test(v) || Number(v)>255)) throw Error('Invalid channels at palette index '+index+'.');
    return rgba ? values.map(Number) : [...values.map(Number),index===0?0:255];
  });
}

function writePaletteText(colors, format) {
  if (!['rgba','pal'].includes(format) || !Array.isArray(colors) || colors.length<1 || colors.length>256) throw Error('Invalid palette format or color count.');
  const rgba = format === 'rgba', eol = rgba ? '\n' : '\r\n';
  const lines = rgba ? [RGBA_COMMENT,'IKEMEN-RGBA','1'] : ['JASC-PAL','0100'];
  lines.push(String(colors.length));
  for (const color of colors) {
    if (!Array.isArray(color) || color.length!==4 || color.some(c=>!Number.isInteger(c)||c<0||c>255)) throw Error('Invalid RGBA color.');
    lines.push((rgba ? color : color.slice(0,3)).join(' '));
  }
  return Buffer.from(lines.join(eol)+eol);
}
module.exports={parsePaletteText,writePaletteText};
