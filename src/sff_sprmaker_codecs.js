"use strict";
// Valid SFF codec streams. LZ5 uses run packets; its packet selection is not a byte-parity claim.
function rle8(pixels) {
  const out = [];
  for (let i = 0; i < pixels.length; ) {
    const value = pixels[i];
    let n = 1;
    while (i + n < pixels.length && pixels[i + n] === value && n < 63) n++;
    if (n >= 3 || (value & 0xc0) === 0x40) out.push(0x40 | n, value);
    else for (let j = 0; j < n; j++) out.push(value);
    i += n;
  }
  return Buffer.from(out);
}
function rle5(pixels) {
  const out = [];
  let i = 0,
    left = 0,
    color = 0;
  const run = (at) => {
    let n = 1;
    while (at + n < pixels.length && pixels[at + n] === pixels[at]) n++;
    return n;
  };
  while (i < pixels.length) {
    if (!left) {
      color = pixels[i];
      left = run(i);
    }
    const lead = Math.min(left, 256),
      hasColor = color !== 0;
    out.push(lead - 1, hasColor ? 0x80 : 0);
    const count = out.length - 1;
    if (hasColor) out.push(color);
    i += lead;
    left -= lead;
    let subs = 0;
    while (i < pixels.length && subs < 127) {
      if (!left) {
        color = pixels[i];
        left = run(i);
        if (left > 17 && (subs > 0 || !hasColor)) break;
      }
      const take = Math.min(left, 8);
      out.push(((take - 1) << 5) | color);
      subs++;
      i += take;
      left -= take;
    }
    out[count] |= subs;
  }
  return Buffer.from(out);
}
function lz5(pixels) {
  const out = [];
  let packets = 0;
  for (let i = 0; i < pixels.length; ) {
    if (packets % 8 === 0) out.push(0);
    const color = pixels[i];
    let n = 1;
    while (i + n < pixels.length && pixels[i + n] === color && n < 263) n++;
    if (n >= 8) out.push(color, n - 8);
    else out.push((n << 5) | color);
    i += n;
    packets++;
  }
  return Buffer.from(out);
}
module.exports = { rle8, rle5, lz5 };
