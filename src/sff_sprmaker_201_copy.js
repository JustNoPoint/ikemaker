"use strict";
const reader = require("./sff_reader"),
  { pixelPlane: transformPlane } = require("./sff_sprite_transforms"),
  codecs = require("./sff_sprmaker_codecs"),
  crypto = require("node:crypto");
function pixelPlane(archive, sprite) {
  const source = reader.resolvedSprite(archive, sprite);
  if (source.colorDepth >= 1 && source.colorDepth <= 8) {
    if (source.width * source.height > 1000000)
      throw Error("Each image is limited to one million pixels.");
    const decodeArchive = [5, 8].includes(source.colorDepth)
      ? archive
      : {
          ...archive,
          sprites: archive.sprites.map((s) =>
            s.index === source.index ? { ...s, colorDepth: 8 } : s,
          ),
        };
    const p = reader.spriteIndexPlane(
      decodeArchive,
      decodeArchive.sprites[sprite.index],
    );
    return {
      width: p.width,
      height: p.height,
      pixels: p.indices,
      channels: 1,
      colorDepth: source.colorDepth,
    };
  }
  return transformPlane(archive, sprite);
}
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const DEFAULTS = Object.freeze({
  autoCrop: false,
  detectDuplicateSprites: false,
  detectDuplicatePalettes: false,
  discardDuplicatePalettes: false,
  decompressOnLoad: false,
  compress5: "lz5",
  compress8: "rle8",
  compress24: "png32",
  report: "summary",
  allowAlphaLoss: false,
});
function options(input = {}) {
  const o = { ...DEFAULTS, ...input };
  for (const key of [
    "autoCrop",
    "detectDuplicateSprites",
    "detectDuplicatePalettes",
    "discardDuplicatePalettes",
    "decompressOnLoad",
    "allowAlphaLoss",
  ])
    if (typeof o[key] !== "boolean")
      throw Error("Invalid SprMaker option " + key);
  for (const [key, values] of [
    ["compress5", ["lz5", "rle5", "none"]],
    ["compress8", ["rle8", "none"]],
    ["compress24", ["none", "png24", "png32"]],
    ["report", ["quiet", "summary", "verbose", "very-verbose"]],
  ])
    if (!values.includes(o[key]))
      throw Error("Unsupported SprMaker option " + key);
  return o;
}
function crop(plane) {
  let left = plane.width,
    top = plane.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < plane.height; y++)
    for (let x = 0; x < plane.width; x++)
      if (
        plane.channels === 1
          ? plane.pixels[y * plane.width + x] !== 0
          : plane.pixels[(y * plane.width + x) * 4 + 3] !== 0
      ) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  if (
    right < 0 ||
    (left === 0 &&
      top === 0 &&
      right === plane.width - 1 &&
      bottom === plane.height - 1)
  )
    return { ...plane, left: 0, top: 0 };
  const width = right - left + 1,
    height = bottom - top + 1,
    pixels = Buffer.alloc(width * height * plane.channels);
  for (let y = 0; y < height; y++)
    plane.pixels.copy(
      pixels,
      y * width * plane.channels,
      ((top + y) * plane.width + left) * plane.channels,
      ((top + y) * plane.width + right + 1) * plane.channels,
    );
  return { ...plane, width, height, pixels, left, top };
}
function prefixed(data, length) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(length);
  return Buffer.concat([prefix, data]);
}
function encode(plane, depth, o) {
  if (plane.channels === 1) {
    if (depth === 5 && plane.pixels.some((v) => v > 31))
      throw Error("A 5-bit sprite contains an index above31.");
    const mode = depth === 5 ? o.compress5 : o.compress8;
    if (mode === "none")
      return { format: 0, colorDepth: depth, data: plane.pixels };
    return {
      format: { rle8: 2, rle5: 3, lz5: 4 }[mode],
      colorDepth: depth,
      data: prefixed(codecs[mode](plane.pixels), plane.pixels.length),
    };
  }
  if (o.compress24 === "png32")
    return {
      format: 12,
      colorDepth: 32,
      data: prefixed(
        reader.rgbaPng(plane.width, plane.height, plane.pixels),
        plane.pixels.length,
      ),
    };
  if (o.compress24 === "png24")
    return {
      format: 11,
      colorDepth: 24,
      data: prefixed(
        require("./sprite_truecolor_edit").rgbPng(
          plane.width,
          plane.height,
          plane.pixels,
        ),
        plane.width * plane.height * 3,
      ),
    };
  const data = Buffer.alloc(plane.width * plane.height * 3);
  for (let i = 0, j = 0; i < plane.pixels.length; i += 4) {
    data[j++] = plane.pixels[i];
    data[j++] = plane.pixels[i + 1];
    data[j++] = plane.pixels[i + 2];
  }
  return { format: 0, colorDepth: 24, data };
}
function build(archive, input = {}) {
  if (archive.header.legacy)
    throw Error("SprMaker2.01 SFFv1 conversion is a separate deferred route.");
  if (!archive.sprites.length || archive.sprites.length > 4096)
    throw Error("Compatible copy supports1–4096sprites.");
  const o = options(input),
    events = [],
    planes = [],
    owners = [],
    seenImages = new Map(),
    sourceOwners = new Map();
  let total = 0,
    alphaLoss = 0;
  for (const sprite of archive.sprites) {
    const source = reader.resolvedSprite(archive, sprite),
      plane = pixelPlane(archive, sprite);
    if ((total += plane.width * plane.height) > 16000000)
      throw Error("Compatible copy exceeds16million decoded pixels.");
    planes.push(plane);
    const identity =
        plane.width +
        ":" +
        plane.height +
        ":" +
        plane.channels +
        ":" +
        hash(plane.pixels),
      bucket = seenImages.get(identity) || [],
      existing = bucket.find((index) =>
        planes[index].pixels.equals(plane.pixels),
      );
    let owner;
    if (o.detectDuplicateSprites && existing !== undefined) owner = existing;
    else owner = sourceOwners.get(source.index) ?? sprite.index;
    if (!sourceOwners.has(source.index)) sourceOwners.set(source.index, owner);
    owners.push(owner);
    if (existing === undefined) {
      bucket.push(sprite.index);
      seenImages.set(identity, bucket);
    }
    if (owner !== sprite.index && (sprite.dataSize || sprite.link !== owner))
      events.push({
        kind: sprite.dataSize ? "SpriteLinked" : "SpriteLinkRetargeted",
        sprite: sprite.index,
        target: owner,
      });
    if (plane.channels === 4 && o.compress24 !== "png32")
      for (let i = 3; i < plane.pixels.length; i += 4)
        if (plane.pixels[i] !== 255) alphaLoss++;
  }
  if (alphaLoss && !o.allowAlphaLoss)
    throw Error(
      "RAW24/PNG24 discards alpha from " +
        alphaLoss +
        " pixels. Explicit alpha-loss review is required.",
    );
  const cropped = new Map();
  for (let i = 0; i < planes.length; i++)
    if (owners[i] === i) {
      const plane = o.autoCrop
        ? crop(planes[i])
        : { ...planes[i], left: 0, top: 0 };
      cropped.set(i, plane);
      if (
        plane.left ||
        plane.top ||
        plane.width !== planes[i].width ||
        plane.height !== planes[i].height
      )
        events.push({
          kind: "SpriteCropped",
          sprite: i,
          oldWidth: planes[i].width,
          oldHeight: planes[i].height,
          width: plane.width,
          height: plane.height,
          left: plane.left,
          top: plane.top,
        });
    }
  const palettes = [],
    mapping = [],
    seenPalettes = new Map(),
    paletteOwners = new Map();
  for (const palette of archive.palettes) {
    const resolved = reader.resolvedPalette(archive, palette.index);
    if (!resolved || palette.colors < 1 || palette.colors > 256)
      throw Error("Unsupported or missing palette color count.");
    const data = Buffer.from(
        reader
          .paletteRgba(archive, palette.index)
          .slice(0, palette.colors)
          .flat(),
      ),
      key = palette.colors + ":" + hash(data),
      bucket = seenPalettes.get(key) || [],
      duplicate = bucket.find((item) => item.data.equals(data))?.index;
    if (o.discardDuplicatePalettes && duplicate !== undefined) {
      mapping[palette.index] = duplicate;
      events.push({
        kind: "PaletteDiscarded",
        palette: palette.index,
        target: duplicate,
      });
      continue;
    }
    const index = palettes.length;
    mapping[palette.index] = index;
    let link = -1;
    if (
      (o.detectDuplicatePalettes || o.discardDuplicatePalettes) &&
      duplicate !== undefined
    )
      link = duplicate;
    else if (paletteOwners.has(resolved.index))
      link = paletteOwners.get(resolved.index);
    else paletteOwners.set(resolved.index, index);
    palettes.push({
      ...palette,
      index,
      link: link < 0 ? 0 : link,
      data: link < 0 ? data : null,
    });
    if (link >= 0 && (palette.dataSize || palette.link !== link))
      events.push({
        kind: "PaletteLinked",
        palette: palette.index,
        target: link,
      });
    if (duplicate === undefined) {
      bucket.push({ index, data });
      seenPalettes.set(key, bucket);
    }
  }
  const encoded = new Map(),
    rows = archive.sprites.map((sprite, i) => {
      const owner = owners[i],
        plane = cropped.get(owner),
        source = reader.resolvedSprite(archive, archive.sprites[owner]),
        depth =
          plane.channels === 1
            ? [2, 4, 8, 16, 32, 64, 128, 256].includes(
                archive.palettes[archive.sprites[owner].paletteIndex]?.colors,
              )
              ? Math.log2(
                  archive.palettes[archive.sprites[owner].paletteIndex].colors,
                )
              : source.colorDepth
            : 32;
      let stored = encoded.get(owner);
      if (!stored) {
        if (plane.channels === 1 && plane.pixels.some((v) => v >= 2 ** depth))
          throw Error("Sprite indexes exceed the assigned palette depth.");
        stored = encode(plane, depth, o);
        encoded.set(owner, stored);
      }
      const axisX = sprite.axisX - plane.left,
        axisY = sprite.axisY - plane.top;
      if (
        ![axisX, axisY].every(
          (v) => Number.isInteger(v) && v >= -32768 && v <= 32767,
        )
      )
        throw Error("Cropping would move an axis outside signed16-bit range.");
      if (owner !== i && (plane.left || plane.top))
        events.push({
          kind: "CropFollower",
          sprite: i,
          target: owner,
          left: plane.left,
          top: plane.top,
        });
      return {
        ...sprite,
        newIndex: i,
        width: plane.width,
        height: plane.height,
        axisX,
        axisY,
        paletteIndex:
          plane.channels === 1
            ? mapping[sprite.paletteIndex]
            : sprite.paletteIndex,
        link: owner === i ? 0 : owner,
        format: stored.format,
        colorDepth:
          plane.channels === 1 &&
          [2, 4, 8, 16, 32, 64, 128, 256].includes(
            archive.palettes[sprite.paletteIndex]?.colors,
          )
            ? Math.log2(archive.palettes[sprite.paletteIndex].colors)
            : stored.colorDepth,
        flags: owner === i && o.decompressOnLoad ? 1 : 0,
        dataSize: owner === i ? stored.data.length : 0,
        data: owner === i ? stored.data : null,
      };
    });
  // Reuse the existing bounded SFF table/data-block writer, including TData and palette links.
  const proxy = {
    ...archive,
    buffer: Buffer.from(archive.buffer),
    palettes: palettes.map((p) => ({ ...p })),
    sprites: rows,
  };
  Buffer.from([0, 1, 0, 2]).copy(proxy.buffer, 12);
  Buffer.from([0, 1, 0, 2]).copy(proxy.buffer, 24);
  const output = require("./sff_direct_delete").rewriteArchiveRows(
    proxy,
    rows,
    palettes,
  ).buffer;
  const deep = rows.some((r) => r.colorDepth > 8 || r.format >= 10);
  Buffer.from(deep ? [0, 1, 0, 2] : [0, 0, 0, 2]).copy(output, 24);
  const result = reader.parseSffBuffer(output);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i],
      actual = result.sprites[i],
      plane = pixelPlane(result, actual),
      wanted = cropped.get(owners[i]);
    for (const key of [
      "group",
      "number",
      "width",
      "height",
      "axisX",
      "axisY",
      "link",
      "format",
      "colorDepth",
      "paletteIndex",
      "flags",
    ])
      if (row[key] !== actual[key])
        throw Error("Compatible-copy row verification failed: " + key);
    let expected = wanted.pixels;
    if (wanted.channels === 4 && o.compress24 !== "png32") {
      expected = Buffer.from(expected);
      for (let j = 3; j < expected.length; j += 4) expected[j] = 255;
    }
    if (!plane.pixels.equals(expected))
      throw Error("Compatible-copy decoded pixel verification failed.");
  }
  for (let i = 0; i < palettes.length; i++)
    if (
      !Buffer.from(
        reader.paletteRgba(result, i).slice(0, palettes[i].colors).flat(),
      ).equals(
        Buffer.from(
          reader
            .paletteRgba(
              archive,
              archive.palettes[mapping.indexOf(i)]?.index ?? 0,
            )
            .slice(0, palettes[i].colors)
            .flat(),
        ),
      )
    )
      throw Error("Compatible-copy palette verification failed.");
  const summary = [
      "SprMaker2.01 semantic-compatible SFF2.0.1.0 copy; no byte-parity claim.",
      rows.length + " sprites; " + palettes.length + " palettes.",
      events.filter((e) => e.kind === "SpriteCropped").length +
        " crops; " +
        events.filter((e) => e.kind === "SpriteLinked").length +
        " new image links; " +
        events.filter((e) => e.kind === "SpriteLinkRetargeted").length +
        " existing image links retargeted; " +
        events.filter((e) => e.kind === "PaletteLinked").length +
        " palette links; " +
        events.filter((e) => e.kind === "PaletteDiscarded").length +
        " palettes removed.",
    ],
    detail =
      o.report === "verbose" || o.report === "very-verbose"
        ? events.map((e) => JSON.stringify(e))
        : [],
    reads =
      o.report === "very-verbose"
        ? archive.sprites.map(
            (s) =>
              "Read sprite " +
              s.group +
              "," +
              s.number +
              "; palette " +
              s.paletteIndex,
          )
        : [];
  return {
    bytes: output,
    archive: result,
    sourceHash: hash(archive.buffer),
    profile: "SprMaker2.01 reviewed options · semantic compatibility",
    spriteCount: rows.length,
    paletteCount: palettes.length,
    options: o,
    events,
    alphaLoss,
    report:
      o.report === "quiet"
        ? null
        : [...summary, ...reads, ...detail].join("\n") + "\n",
  };
}
module.exports = { build, options, DEFAULTS };
