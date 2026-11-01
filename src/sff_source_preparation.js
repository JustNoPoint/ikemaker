'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { crc32 } = require('./sff_png8_source');
const { pcx8, rgbaPng, indexedSourcePng } = require('./sff_reader');

const SUPPORTED = new Set(['.png', '.bmp', '.pcx']);

function safePrefix(value) {
  const clean = String(value || '').trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
  if (!clean || !/[a-z0-9]/i.test(clean)) throw new Error('Enter a filename prefix containing letters or numbers.');
  if (clean.length > 120) throw new Error('The filename prefix must contain no more than 120 characters.');
  return clean;
}

function naturalParts(value) { return String(value).toLowerCase().match(/\d+|\D+/g) || []; }

function naturalCompare(left, right) {
  const a = naturalParts(path.basename(left)), b = naturalParts(path.basename(right)), length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    if (a[index] === b[index]) continue;
    const aNumber = /^\d+$/.test(a[index]), bNumber = /^\d+$/.test(b[index]);
    if (aNumber && bNumber) {
      const aValue = a[index].replace(/^0+(?=\d)/, ''), bValue = b[index].replace(/^0+(?=\d)/, '');
      if (aValue.length !== bValue.length) return aValue.length - bValue.length;
      const numericText = aValue.localeCompare(bValue, 'en');
      if (numericText) return numericText;
      if (a[index].length !== b[index].length) return a[index].length - b[index].length;
    }
    const text = a[index].localeCompare(b[index], 'en', { sensitivity: 'base' });
    if (text) return text;
  }
  return String(left).localeCompare(String(right), 'en', { sensitivity: 'base' });
}

function orderedSources(files, mode = 'selected') {
  const values = [...(files || [])];
  if (mode === 'selected') return values;
  if (mode === 'natural') return values.map((value, ordinal) => ({ value, ordinal })).sort((left, right) => naturalCompare(left.value, right.value) || left.ordinal - right.ordinal).map(item => item.value);
  throw new Error(`Unsupported source ordering mode: ${mode}.`);
}

function planPreparedSources(files, options = {}) {
  const sources = (files || []).map(filename => path.resolve(filename));
  if (!sources.length) throw new Error('Choose at least one PNG, BMP, or PCX source.');
  const prefix = safePrefix(options.prefix ?? 'sprite'), start = Number(options.start ?? 0), padding = Number(options.padding ?? 4);
  if (!Number.isSafeInteger(start) || start < 0) throw new Error('The starting filename number must be zero or greater.');
  if (sources.length - 1 > Number.MAX_SAFE_INTEGER - start) throw new Error('The prepared filename sequence exceeds the safe numeric range.');
  if (!Number.isSafeInteger(padding) || padding < 1 || padding > 12) throw new Error('Filename padding must be from 1 through 12.');
  const seenSource = new Set(), seenOutput = new Set();
  return sources.map((source, ordinal) => {
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Source image is missing: ${source}`);
    const key = process.platform === 'win32' ? source.toLowerCase() : source;
    if (seenSource.has(key)) throw new Error(`Source image was selected more than once: ${source}`);
    seenSource.add(key);
    const extension = path.extname(source).toLowerCase();
    if (!SUPPORTED.has(extension)) throw new Error(`Unsupported source ${path.basename(source)}. Use PNG, BMP, or PCX.`);
    const outputName = `${prefix}_${String(start + ordinal).padStart(padding, '0')}.png`;
    if (seenOutput.has(outputName.toLowerCase())) throw new Error(`Prepared filename collision: ${outputName}`);
    seenOutput.add(outputName.toLowerCase());
    return { source, sourceName: path.basename(source), sourceExtension: extension, ordinal, outputName, outputNumber: start + ordinal, conversion: extension === '.png' ? 'copy-png' : `${extension.slice(1)}-to-png` };
  });
}

function inspectPreparedPng(buffer, label = 'Prepared image') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 45 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${label} is not a valid PNG.`);
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = -1, sawIdat = false, sawIend = false;
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new Error(`${label} has a truncated PNG chunk header.`);
    const size = buffer.readUInt32BE(offset), end = offset + size + 12;
    if (!Number.isSafeInteger(end) || end > buffer.length) throw new Error(`${label} has a PNG chunk that exceeds the file.`);
    const type = buffer.toString('ascii', offset + 4, offset + 8), chunk = buffer.subarray(offset + 8, offset + 8 + size);
    if (buffer.readUInt32BE(offset + 8 + size) !== crc32(buffer.subarray(offset + 4, offset + 8 + size))) throw new Error(`${label} has an invalid ${type} CRC.`);
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13 || width) throw new Error(`${label} has an invalid PNG header.`);
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); bitDepth = chunk[8]; colorType = chunk[9];
      if (!width || !height || width * height > 100000000) throw new Error(`${label} has invalid or excessive PNG dimensions.`);
      const allowed = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!allowed[colorType]?.includes(bitDepth) || chunk[10] !== 0 || chunk[11] !== 0 || chunk[12] > 1) throw new Error(`${label} has an unsupported PNG format.`);
    } else if (type === 'IDAT') sawIdat = true;
    else if (type === 'IEND') {
      if (size !== 0 || !sawIdat || end !== buffer.length) throw new Error(`${label} has an invalid PNG ending.`);
      sawIend = true;
    }
    offset = end;
  }
  if (!width || !sawIdat || !sawIend) throw new Error(`${label} is missing required PNG data.`);
  return { width, height, bitDepth, colorType, indexed: colorType === 3 };
}

function checkedArea(width, height, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 100000000) throw new Error(`${label} has invalid or excessive dimensions.`);
  return width * height;
}

function bmpRle8(data, width, height, label) {
  const fileOrder = Buffer.alloc(width * height); let source = 0, x = 0, y = 0, ended = false;
  const put = value => {
    if (x >= width || y >= height) throw new Error(`${label} RLE8 pixels exceed the declared bounds.`);
    fileOrder[y * width + x] = value; x += 1;
  };
  while (source < data.length && !ended) {
    if (source + 2 > data.length) throw new Error(`${label} has a truncated RLE8 command.`);
    const count = data[source++], value = data[source++];
    if (count) { for (let index = 0; index < count; index += 1) put(value); continue; }
    if (value === 0) { x = 0; y += 1; if (y > height) throw new Error(`${label} RLE8 rows exceed the declared height.`); continue; }
    if (value === 1) { ended = true; continue; }
    if (value === 2) {
      if (source + 2 > data.length) throw new Error(`${label} has a truncated RLE8 delta.`);
      x += data[source++]; y += data[source++];
      if (x > width || y >= height) throw new Error(`${label} has an RLE8 delta outside the image.`);
      continue;
    }
    const literal = value;
    if (source + literal + (literal & 1) > data.length) throw new Error(`${label} has a truncated RLE8 literal run.`);
    for (let index = 0; index < literal; index += 1) put(data[source++]);
    if (literal & 1) source += 1;
  }
  if (!ended) throw new Error(`${label} has no RLE8 end-of-bitmap marker.`);
  const indices = Buffer.alloc(width * height);
  for (let row = 0; row < height; row += 1) fileOrder.copy(indices, row * width, (height - 1 - row) * width, (height - row) * width);
  return indices;
}

function bmpToPng(buffer, label = 'BMP source') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 54 || buffer.toString('ascii', 0, 2) !== 'BM') throw new Error(`${label} is not a Windows BMP file.`);
  const pixelOffset = buffer.readUInt32LE(10), dibSize = buffer.readUInt32LE(14);
  if (dibSize < 40 || 14 + dibSize > buffer.length) throw new Error(`${label} uses an unsupported BMP header.`);
  const rawWidth = buffer.readInt32LE(18), rawHeight = buffer.readInt32LE(22), planes = buffer.readUInt16LE(26), bits = buffer.readUInt16LE(28), compression = buffer.readUInt32LE(30);
  if (rawWidth < 1 || rawHeight === 0 || planes !== 1) throw new Error(`${label} has invalid BMP geometry.`);
  const width = rawWidth, height = Math.abs(rawHeight), area = checkedArea(width, height, label), topDown = rawHeight < 0;
  if (![8, 24, 32].includes(bits) || ![0, 1].includes(compression) || (compression === 1 && bits !== 8)) throw new Error(`${label} requires uncompressed indexed/24/32-bit or RLE8 BMP data for native conversion.`);
  const stride = Math.floor((width * bits + 31) / 32) * 4;
  if (pixelOffset < 14 + dibSize || pixelOffset >= buffer.length || (compression === 0 && pixelOffset + stride * height > buffer.length)) throw new Error(`${label} has truncated BMP pixels.`);
  if (bits === 8) {
    const declared = buffer.readUInt32LE(46), count = declared || 256, paletteOffset = 14 + dibSize;
    if (count < 1 || count > 256 || paletteOffset + count * 4 > pixelOffset) throw new Error(`${label} has an invalid BMP palette.`);
    const colors = Array.from({ length: 256 }, (_unused, index) => {
      if (index >= count) return [0, 0, 0, index === 0 ? 0 : 255];
      const at = paletteOffset + index * 4;
      return [buffer[at + 2], buffer[at + 1], buffer[at], index === 0 ? 0 : 255];
    });
    let indices;
    if (compression === 1) {
      if (topDown) throw new Error(`${label} uses an invalid top-down RLE8 layout.`);
      const imageSize = buffer.readUInt32LE(34), end = imageSize ? pixelOffset + imageSize : buffer.length;
      if (end > buffer.length) throw new Error(`${label} has truncated RLE8 BMP data.`);
      indices = bmpRle8(buffer.subarray(pixelOffset, end), width, height, label);
    } else {
      indices = Buffer.alloc(area);
      for (let y = 0; y < height; y += 1) {
        const sourceY = topDown ? y : height - 1 - y, source = pixelOffset + sourceY * stride;
        buffer.copy(indices, y * width, source, source + width);
      }
    }
    return indexedSourcePng(width, height, indices, colors);
  }
  const rgba = Buffer.alloc(area * 4), pixelBytes = bits / 8;
  for (let y = 0; y < height; y += 1) {
    const sourceY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = pixelOffset + sourceY * stride + x * pixelBytes, target = (y * width + x) * 4;
      rgba[target] = buffer[source + 2]; rgba[target + 1] = buffer[source + 1]; rgba[target + 2] = buffer[source]; rgba[target + 3] = 255;
    }
  }
  return rgbaPng(width, height, rgba);
}

function pcxToPng(buffer, label = 'PCX source') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 132 || buffer[0] !== 0x0a) throw new Error(`${label} is not an 8-bit PCX file.`);
  const encoding = buffer[2], bits = buffer[3], xmin = buffer.readUInt16LE(4), ymin = buffer.readUInt16LE(6), xmax = buffer.readUInt16LE(8), ymax = buffer.readUInt16LE(10), planes = buffer[65], bytesPerLine = buffer.readUInt16LE(66);
  if (![0, 1].includes(encoding) || bits !== 8 || ![1, 3].includes(planes) || xmax < xmin || ymax < ymin) throw new Error(`${label} requires an 8-bit indexed or three-plane true-color PCX image for native conversion.`);
  const width = xmax - xmin + 1, height = ymax - ymin + 1; checkedArea(width, height, label);
  if (bytesPerLine < width) throw new Error(`${label} has a PCX scanline shorter than its width.`);
  if (planes === 1) {
    const paletteMarker = buffer.length - 769;
    if (paletteMarker < 128 || buffer[paletteMarker] !== 0x0c) throw new Error(`${label} has no terminal 256-color PCX palette.`);
    const pixels = pcx8(buffer.subarray(128, paletteMarker), width, height, bytesPerLine, encoding === 1);
    const colors = Array.from({ length: 256 }, (_unused, index) => {
      const at = paletteMarker + 1 + index * 3;
      return [buffer[at], buffer[at + 1], buffer[at + 2], index === 0 ? 0 : 255];
    });
    return indexedSourcePng(width, height, pixels, colors);
  }
  const decoded = pcx8(buffer.subarray(128), bytesPerLine * 3, height, bytesPerLine * 3, encoding === 1), rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const row = y * bytesPerLine * 3, target = (y * width + x) * 4;
    rgba[target] = decoded[row + x]; rgba[target + 1] = decoded[row + bytesPerLine + x]; rgba[target + 2] = decoded[row + bytesPerLine * 2 + x]; rgba[target + 3] = 255;
  }
  return rgbaPng(width, height, rgba);
}

function nativeLegacyToPng(buffer, extension, label) {
  if (extension === '.bmp') return bmpToPng(buffer, label);
  if (extension === '.pcx') return pcxToPng(buffer, label);
  throw new Error(`${label} has no native legacy-image converter.`);
}

function prepareSourceBuffers(plan, temporaryDirectory, imageMagick = 'magick', runner = spawnSync) {
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  return plan.map(item => {
    const sourceBuffer = fs.readFileSync(item.source);
    let buffer, converter = 'copy';
    if (item.conversion === 'copy-png') buffer = sourceBuffer;
    else {
      try { buffer = nativeLegacyToPng(sourceBuffer, item.sourceExtension, item.sourceName); converter = 'native'; }
      catch (nativeError) {
        const output = path.join(temporaryDirectory, item.outputName), result = runner(imageMagick, [item.source, output], { windowsHide: true, encoding: 'utf8' });
        if (result?.error || result?.status !== 0 || !fs.existsSync(output)) {
          const detail = String(result?.stderr || result?.error?.message || `ImageMagick conversion exited with ${result?.status ?? 'no status'}.`).trim();
          throw new Error(`Could not convert ${item.sourceName} to PNG. Native conversion: ${nativeError.message} ImageMagick fallback: ${detail}`);
        }
        buffer = fs.readFileSync(output); converter = 'imagemagick-fallback';
      }
    }
    const png = inspectPreparedPng(buffer, item.outputName);
    return {
      ...item, buffer, converter, ...png,
      sourceByteHash: crypto.createHash('sha256').update(sourceBuffer).digest('hex').toUpperCase(),
      outputByteHash: crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase()
    };
  });
}

module.exports = { SUPPORTED, safePrefix, naturalCompare, orderedSources, planPreparedSources, inspectPreparedPng, bmpRle8, bmpToPng, pcxToPng, nativeLegacyToPng, prepareSourceBuffers };
