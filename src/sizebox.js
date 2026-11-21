'use strict';

const SIZEBOX_PATTERN = /^(\s*)(stand|crouch|air|down)\.sizebox(\s*=\s*)([^;]*)(;.*)?$/i;
const SIZE_NUMBER = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?)(\d+))?$/;
const SOURCE_PATTERN = /;\s*IKEMEN ZSS Tools:\s*sourceBox=([^;]+);\s*referenceScale=([^;\s]+)\s*$/i;

function readSizeNumber(value) {
  const match = SIZE_NUMBER.exec(String(value ?? '').trim());
  if (!match) return undefined;
  const [, sign, mantissa, exponentSign, exponent] = match;
  // Ikemen's Atof checks the exponent sign at an offset from the unsigned
  // mantissa. A leading sign therefore makes a negative exponent positive.
  const power = exponentSign === '-' && !sign ? -Number(exponent) : Number(exponent || 0);
  const number = Number(`${sign}${mantissa}e${power}`);
  return Number.isFinite(Math.fround(number)) ? (number || 0) : undefined;
}

function stripSizeboxScaleMarker(comment) {
  return String(comment || '').replace(SOURCE_PATTERN, '').trimEnd();
}

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return number;
}

function parseSizeboxLine(line) {
  const match = SIZEBOX_PATTERN.exec(String(line));
  const fields = match?.[4].trim().split(',').map(readSizeNumber);
  if (fields?.length !== 4 || fields.includes(undefined)) throw new Error('Place the cursor on a stand, crouch, air, or down .sizebox assignment with four numeric values.');
  const trailing = (match[4].match(/\s*$/)?.[0] || '') + (match[5] || '');
  const marker = trailing.match(SOURCE_PATTERN);
  const displayed = fields;
  let source = displayed;
  let referenceScale;
  if (marker) {
    source = marker[1].split(',').map((value) => Number(value.trim()));
    referenceScale = marker[2].split(',').map((value) => Number(value.trim()));
    if (source.length !== 4 || source.some((value) => !Number.isFinite(value)) ||
        referenceScale.length !== 2 || referenceScale.some((value) => !Number.isFinite(value))) {
      throw new Error('The existing IKEMEN ZSS Tools sizebox marker is invalid.');
    }
  }
  return {
    indent: match[1],
    name: match[2],
    separator: match[3],
    displayed,
    source,
    referenceScale,
    trailing: stripSizeboxScaleMarker(trailing)
  };
}

function readCharacterScale(text) {
  const x = String(text).match(/^\s*xscale\s*=\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/im);
  const y = String(text).match(/^\s*yscale\s*=\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/im);
  if (!x || !y) throw new Error('This constants file must contain numeric xscale and yscale assignments.');
  return [finitePositive(x[1], 'xscale'), finitePositive(y[1], 'yscale')];
}

function roundCoordinate(value) {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumber(value) {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, integer, fraction = '', exponent] = match;
  const digits = integer + fraction, position = integer.length + Number(exponent);
  if (position <= 0) return `${sign}0.${'0'.repeat(-position)}${digits}`;
  if (position >= digits.length) return sign + digits.padEnd(position, '0');
  return `${sign}${digits.slice(0, position)}.${digits.slice(position)}`;
}

function scaleSizebox(source, referenceScale, characterScale) {
  const [referenceX, referenceY] = referenceScale.map((value, index) => finitePositive(value, index ? 'reference yscale' : 'reference xscale'));
  const [characterX, characterY] = characterScale.map((value, index) => finitePositive(value, index ? 'character yscale' : 'character xscale'));
  return [
    roundCoordinate(source[0] * referenceX / characterX),
    roundCoordinate(source[1] * referenceY / characterY),
    roundCoordinate(source[2] * referenceX / characterX),
    roundCoordinate(source[3] * referenceY / characterY)
  ];
}

function formatScaledLine(parsed, scaled, referenceScale) {
  const sourceText = parsed.source.map(formatNumber).join(',');
  const referenceText = referenceScale.map(formatNumber).join(',');
  const preserved = parsed.trailing ? `${parsed.trailing} ` : ' ';
  return `${parsed.indent}${parsed.name}.sizebox${parsed.separator}${scaled.map(formatNumber).join(', ')}${preserved}; IKEMEN ZSS Tools: sourceBox=${sourceText}; referenceScale=${referenceText}`;
}

module.exports = { parseSizeboxLine, readCharacterScale, scaleSizebox, formatScaledLine, readSizeNumber, stripSizeboxScaleMarker, formatNumber };
