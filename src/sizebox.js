'use strict';

const SIZEBOX_PATTERN = /^(\s*)(stand|crouch|air|down)\.sizebox(\s*=\s*)([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)(.*)$/i;
const SOURCE_PATTERN = /;\s*IKEMEN ZSS Tools:\s*sourceBox=([^;]+);\s*referenceScale=([^;\s]+)\s*$/i;

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return number;
}

function parseSizeboxLine(line) {
  const match = String(line).match(SIZEBOX_PATTERN);
  if (!match) throw new Error('Place the cursor on a stand, crouch, air, or down .sizebox assignment.');
  const trailing = match[8] || '';
  const marker = trailing.match(SOURCE_PATTERN);
  const displayed = match.slice(4, 8).map(Number);
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
    trailing: trailing.replace(SOURCE_PATTERN, '').trimEnd()
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
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');
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

module.exports = { parseSizeboxLine, readCharacterScale, scaleSizebox, formatScaledLine };
