'use strict';
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const {
  parseSffBuffer,
  spritePng,
  friendlyVersion
} = require('./sff_reader');
const {
  decodePng
} = require('./palette_index_organizer_model');
const {
  createSffV21Bytes
} = require('./sff_v21_writer');
const {
  specificationHash
} = require('./sff_build_specification');
const {
  inspectPsd,
  planPsdExports,
  exportPsdPlan
} = require('./sff_psd_intake');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const key = s => `${s.group},${s.number}`;

function unique(rows, label) {
  const map = new Map();
  for (const row of rows) {
    if (map.has(key(row))) throw Error(`Ambiguous ${label} identity ${key(row)}.`);
    map.set(key(row), row);
  }
  return map;
}

function matchSources(spec, mappings, psdFolder, archive) {
  if (spec?.schema !== 'ikemaker.sff-build-specification' || spec.version !== 1 || spec.specificationHash !== specificationHash(spec)) throw Error('Choose an intact reviewed IKEMaker SFF build specification JSON (version 1).');
  const saved = unique(spec.sprites, 'saved JSON'),
    current = unique(archive.sprites, 'destination SFF'),
    found = [],
    skipped = [],
    names = new Map();
  for (const row of mappings) {
    const name = path.parse(String(row.OriginalRelativePath || '').replace(/\\/g, '/')).name.toLowerCase();
    if (names.has(name)) throw Error(`Ambiguous mapping filename ${name}.`);
    names.set(name, row);
  }
  for (const file of fs.readdirSync(psdFolder).filter(n => /\.psd$/i.test(n)).sort()) {
    const row = names.get(path.parse(file).name.toLowerCase());
    if (!row) throw Error(`No reviewed filename mapping for ${file}. Select the original approved manifest CSV.`);
    const group = Number(row.ComputedGroup),
      number = Number(row.ImageIndex);
    if (!String(row.ComputedGroup ?? '').trim() || !String(row.ImageIndex ?? '').trim() || !Number.isInteger(group) || !Number.isInteger(number) || group < 0 || group > 65535 || number < 0 || number > 65535) throw Error(`Invalid mapping identity for ${file}.`);
    if (group >= 10000) {
      skipped.push({
        file,
        reason: 'Archived/non-base source group',
        group
      });
      continue;
    }
    const id = `${group},${number}`,
      base = current.get(id),
      entry = saved.get(id);
    if (!base || !entry || entry.axisX !== base.axisX || entry.axisY !== base.axisY) throw Error(`${file}: saved JSON identity/axes do not match destination ${id}.`);
    if (entry.crop?.mode && entry.crop.mode !== 'none') throw Error(`${file}: cropped saved sources are unsupported; use an uncropped reviewed JSON.`);
    if (entry.source?.width !== base.width || entry.source?.height !== base.height) throw Error(`${file}: saved canvas differs from destination ${id}.`);
    found.push({
      filename: path.join(psdFolder, file),
      file,
      group,
      number,
      axisX: base.axisX,
      axisY: base.axisY,
      width: base.width,
      height: base.height,
      paletteIndex: base.paletteIndex
    });
  }
  if (!found.length) throw Error('No matching base PSDs were found.');
  unique(found, 'PSD source');
  return {
    found,
    skipped
  };
}

function extractSources(matches, directory, layerName, executable = 'magick', progress = () => {}) {
  const {
    spawnSync
  } = require('child_process');
  const sprites = [],
    skipped = [...matches.skipped];
  matches.found.forEach((row, i) => {
    progress(i + 1, matches.found.length, row.file);
    const inspection = inspectPsd(row.filename, executable),
      plan = planPsdExports(inspection.records, layerName ? 'layers' : 'base-and-optional-layer1');
    let selected;
    if (layerName) {
      const candidates = inspection.records.filter(r => r.index !== 0 && r.name.toLowerCase() === layerName.toLowerCase());
      if (candidates.length > 1) throw Error(`${row.file}: repeated layer name ${layerName}.`);
      selected = candidates[0];
    } else selected = plan.exports.find(e => e.role === 'layer-1')?.pages[0];
    if (!selected) {
      skipped.push({
        file: row.file,
        reason: 'No separately labelled matching overlay layer'
      });
      return;
    }
    if (plan.canvas.width !== row.width || plan.canvas.height !== row.height) throw Error(`${row.file}: PSD canvas differs from saved base; axes cannot be copied safely.`);
    const out = path.join(directory, String(i));
    plan.exports = [{
      filename: 'layer.png',
      label: selected.name,
      pages: [selected],
      role: 'layer-1',
      sourceOrdinal: selected.index
    }];
    plan.rawLayerSnapshots = true;
    const exported = exportPsdPlan(inspection, plan, out)[0],
      pngPath = path.join(out, 'rgba.png');
    const conversion = spawnSync(executable, [exported.filename, 'PNG32:' + pngPath], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 20000
    });
    if (conversion.error || conversion.status !== 0) throw conversion.error || Error(conversion.stderr || 'PNG32 conversion failed.');
    const png = fs.readFileSync(pngPath),
      decoded = decodePng(png);
    sprites.push({
      ...row,
      png,
      rgbaHash: sha(decoded.rgba),
      layer: selected.name,
      page: selected.index,
      psdHash: sha(fs.readFileSync(row.filename))
    });
  });
  return {
    sprites,
    skipped
  };
}

function planBank(archive, sprites, bank = 1) {
  if (friendlyVersion(archive.header.version) !== '2.1') throw Error('PSD costume banks require SFF 2.1. Convert a copy with SFF Creator first.');
  if (!Number.isInteger(bank) || bank < 1 || bank > 6) throw Error('Choose costume bank 1 through 6 (10000-group steps).');
  if (sprites.some(s => s.group + bank * 10000 > 65535)) throw Error(`Costume bank ${bank} exceeds the SFF group limit for these base groups.`);
  if (!sprites.length) throw Error('No separate overlay layers were found.');
  const existing = unique(archive.sprites, 'destination'),
    additions = [],
    equivalent = [],
    promotions = [];
  unique(sprites, 'overlay source');
  const wanted = new Set(sprites.map(s => `${s.group+bank*10000},${s.number}`));
  if (archive.sprites.some(s => s.group >= bank * 10000 && s.group < (bank + 1) * 10000 && !wanted.has(key(s)))) throw Error(`Costume bank ${bank} contains unrelated sprites. Choose another bank.`);
  for (const row of sprites) {
    const entry = {
        ...row,
        group: row.group + bank * 10000
      },
      prior = existing.get(key(entry));
    if (!prior) additions.push(entry);
    else if (prior.axisX === entry.axisX && prior.axisY === entry.axisY && prior.width === entry.width && prior.height === entry.height) {
      const png = spritePng(archive, prior);
      if (entry.indexed && prior.colorDepth === 8 && prior.paletteIndex === entry.paletteIndex && require('./sff_png8_source').readIndexedPng8(png).decodedHash === entry.indexHash) equivalent.push(entry);
      else if (entry.indexed && prior.format === 12 && sha(decodePng(png).rgba) === entry.sourceRgbaHash) {
        if (archive.sprites.some(s => !s.dataSize && s.link === prior.index)) throw Error(`Costume bank collision at ${key(entry)}: existing linked sprites depend on this payload; promotion is blocked.`);
        promotions.push({
          ...entry,
          replaceIndex: prior.index
        });
      } else if (!entry.indexed && sha(decodePng(png).rgba) === entry.rgbaHash) equivalent.push(entry);
      else throw Error(`Costume bank collision at ${key(entry)}. Existing pixels or axes differ.`);
    } else throw Error(`Costume bank collision at ${key(entry)}. Existing pixels or axes differ. Choose another bank; no sprites were replaced.`);
  }
  return {
    bank,
    additions,
    equivalent,
    promotions
  };
}

function appendBank(archive, plan) {
  const {
    relayoutSffV2
  } = require('./sff_direct_delete');
  const changed = [...plan.additions, ...(plan.promotions || [])];
  if (!changed.length) return relayoutSffV2(archive).buffer;
  const sprites = changed.map((row, i) => ({
    entryId: `overlay:${i}`,
    group: row.group,
    number: row.number,
    axisX: row.axisX,
    axisY: row.axisY,
    format: row.indexed ? 'png8' : 'png32',
    compression: row.indexed ? 'png8' : 'png32',
    colorDepth: row.indexed ? 8 : 32,
    paletteId: row.indexed ? 'master' : null,
    duplicatePolicy: 'preserve-separate',
    crop: {
      mode: 'none'
    },
    source: {
      relativePath: `${i}.png`,
      width: row.width,
      height: row.height,
      byteHash: sha(row.png),
      decodedHash: row.indexed ? row.indexHash : row.rgbaHash
    }
  }));
  const spec = {
    schema: 'ikemaker.sff-build-specification',
    version: 1,
    target: {
      sffVersion: '2.1'
    },
    sprites,
    palettes: changed.some(s => s.indexed) ? [{
      entryId: 'master',
      group: 1,
      number: 0,
      tableOrder: 'sff',
      duplicatePolicy: 'preserve-separate',
      colors: changed.find(s => s.indexed).masterColors
    }] : []
  };
  spec.specificationHash = specificationHash(spec);
  const generated = parseSffBuffer(createSffV21Bytes(spec, {
    readSource: p => changed[Number(path.parse(p).name)].png
  }));
  const original = archive.buffer,
    table = Buffer.from(original.subarray(archive.header.firstSpriteHeaderOffset, archive.header.firstSpriteHeaderOffset + archive.sprites.length * 28)),
    headers = [],
    payloads = [];
  let offset = original.length + table.length + plan.additions.length * 28;
  for (const sprite of generated.sprites) {
    const header = Buffer.from(generated.buffer.subarray(sprite.headerOffset, sprite.headerOffset + 28)),
      size = header.readUInt32LE(20),
      data = generated.buffer.subarray(generated.header.literalDataOffset + header.readUInt32LE(16), generated.header.literalDataOffset + header.readUInt32LE(16) + size);
    header.writeUInt32LE(offset - archive.header.literalDataOffset, 16);
    const row = changed[sprite.index];
    if (row.indexed) header.writeUInt16LE(row.paletteIndex, 24);
    offset += data.length;
    if (row.replaceIndex !== undefined) header.copy(table, row.replaceIndex * 28);
    else headers.push(header);
    payloads.push(data);
  }
  const bytes = Buffer.concat([original, table, ...headers, ...payloads]);
  bytes.writeUInt32LE(original.length, 36);
  bytes.writeUInt32LE(archive.sprites.length + headers.length, 40);
  bytes.writeUInt32LE(bytes.length - archive.header.literalDataOffset, 56);
  const after = parseSffBuffer(bytes);
  for (let i = 0; i < archive.sprites.length; i++)
    if (!(plan.promotions || []).some(s => s.replaceIndex === i) && !original.subarray(archive.sprites[i].headerOffset, archive.sprites[i].headerOffset + 28).equals(bytes.subarray(after.sprites[i].headerOffset, after.sprites[i].headerOffset + 28))) throw Error('Existing sprite header changed.');
  changed.forEach((row, i) => {
    const png = spritePng(after, after.sprites[row.replaceIndex ?? (archive.sprites.length + i)]);
    if (row.indexed ? require('./sff_png8_source').readIndexedPng8(png).decodedHash !== row.indexHash : sha(decodePng(png).rgba) !== row.rgbaHash) throw Error('Overlay pixel verification failed.');
  });
  return relayoutSffV2(after).buffer;
}

function suggestBank(archive, sprites) {
  for (let bank = 1; bank <= 6; bank++) {
    try {
      planBank(archive, sprites, bank);
      return bank;
    } catch (error) {
      if (!/collision|unrelated sprites|exceeds the SFF group limit/.test(error.message)) throw error;
    }
  }
  throw Error('No open compatible costume bank remains (1–6).');
}
async function prepareIndexed(api, spec, archive, sprites) {
  const reader = require('./sff_reader'),
    master = require('./sff_master_intake');
  const choices = spec.palettes.filter(p => Array.isArray(p.colors) && p.colors.length === 256 && p.colors[0][3] === 0).map(p => ({
    label: `Saved master palette ${p.group},${p.number}`,
    description: 'Exact reviewed source-color → index evidence; no nearest-color mapping',
    palette: p
  })).sort((a, b) => (a.palette.group === 1 && a.palette.number === 0 ? -1 : 0) - (b.palette.group === 1 && b.palette.number === 0 ? -1 : 0));
  if (!choices.length) throw Error('Saved JSON contains no indexing palette evidence. Use exact-color import or select an original reviewed build with its master colors.');
  const selected = await api.window.showQuickPick(choices, {
    title: 'Choose the saved source indexing master (color-separation palette)'
  });
  if (!selected) return null;
  const palette = selected.palette,
    colors = palette.colors,
    id = `${palette.group},${palette.number}`;
  const analysis = master.analyzeExactMaster(sprites.map(s => s.png), colors),
    unsupported = new Set(analysis.unmatched.flatMap(row => row.images));
  const partialOnly = analysis.unmatched.every(row => row.rgba[3] > 0 && row.rgba[3] < 255 && colors.some(c => c[0] === row.rgba[0] && c[1] === row.rgba[1] && c[2] === row.rgba[2] && c[3] === 255));
  const alphaChanges = {
    threshold: 128,
    toTransparent: analysis.unmatched.filter(r => r.rgba[3] < 128).reduce((n, r) => n + r.pixels, 0),
    toOpaque: analysis.unmatched.filter(r => r.rgba[3] >= 128).reduce((n, r) => n + r.pixels, 0)
  };
  let fallback = '';
  if (unsupported.size) {
    const options = [{
      label: 'Keep these frames in source colors',
      description: `${unsupported.size} frame(s) retain exact alpha and PNG32 colors; these frames will not follow the body palette`,
      value: 'rgba'
    }];
    if (partialOnly) options.push({
      label: alphaChanges.toOpaque ? 'Threshold partial alpha at 128' : 'Make faint edge pixels transparent',
      description: `Explicit pixel change: ${alphaChanges.toTransparent} pixels become transparent; ${alphaChanges.toOpaque} become opaque. Remaining pixels stay unchanged. All frames follow body palette.`,
      value: 'threshold'
    });
    const decision = await api.window.showQuickPick(options, {
      title: 'Some layers cannot follow the body palette exactly'
    });
    if (!decision) return null;
    fallback = decision.value;
  }
  const eligible = sprites.filter((s, i) => fallback === 'threshold' || !unsupported.has(i));
  const unmatchedColors = new Set(analysis.unmatched.map(row => row.id));
  const prepared = eligible.map(s => {
    if (fallback !== 'threshold') return s.png;
    const image = decodePng(s.png),
      rgba = Buffer.from(image.rgba);
    for (let at = 3; at < rgba.length; at += 4) {
      if (rgba[at] === 0 || rgba[at] === 255) continue;
      const id = rgba.subarray(at - 3, at + 1).join(',');
      if (unmatchedColors.has(id)) rgba[at] = rgba[at] < 128 ? 0 : 255;
    }
    return reader.rgbaPng(image.width, image.height, rgba);
  });
  const mapped = await master.reviewExactMaster(api, prepared, colors, id);
  if (!mapped) return null;
  const rows = eligible.map((s, i) => {
    const body = archive.sprites.find(b => b.group === s.group && b.number === s.number);
    if (!body || body.colorDepth !== 8 || !archive.palettes[body.paletteIndex]) throw Error(`${s.file||key(s)}: matching body does not use an indexed SFF palette.`);
    const decoded = require('./sff_png8_source').readIndexedPng8(mapped.buffers[i]),
      display = reader.paletteRgba(archive, body.paletteIndex);
    for (const index of new Set(decoded.indices))
      if (colors[index][3] !== display[index][3]) throw Error(`${s.file||key(s)}: body palette changes alpha at index ${index}; indexed import would change transparency.`);
    return {
      ...s,
      png: mapped.buffers[i],
      indexed: true,
      indexHash: decoded.decodedHash,
      sourceRgbaHash: s.rgbaHash,
      masterColors: colors,
      paletteIndex: body.paletteIndex
    };
  });
  const unsupportedRows = sprites.filter((s, i) => unsupported.has(i));
  if (fallback === 'rgba') rows.push(...unsupportedRows);
  return {
    sprites: rows,
    skipped: [],
    evidence: {
      mode: 'follow-body-palette',
      sourceMaster: id,
      sourceMasterHash: sha(Buffer.from(JSON.stringify(colors))),
      decisions: mapped.decisions,
      usedColors: mapped.usedColors,
      ambiguousColors: mapped.ambiguousColors,
      unsupportedPolicy: fallback,
      alphaChanges: fallback === 'threshold' ? alphaChanges : null,
      unsupportedFrames: unsupportedRows.map(s => s.file || key(s)),
      unmatchedColors: analysis.unmatched,
      assignment: 'Each indexed overlay uses its matching body sprite palette slot; original transparent pixels become index 0'
    }
  };
}
module.exports = {
  sha,
  matchSources,
  extractSources,
  planBank,
  appendBank,
  suggestBank,
  prepareIndexed
};
