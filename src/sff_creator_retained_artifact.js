'use strict';

const { types: { isProxy } } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');

function plain(value) { return value && typeof value === 'object' && !isProxy(value) && !Array.isArray(value) && !Buffer.isBuffer(value) && !ArrayBuffer.isView(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }

function selectCanonicalRetainedJson(inventory, canonicalName, schemas, label = 'retained artifact') {
  if (!Array.isArray(inventory) || !inventory.length || typeof canonicalName !== 'string' || !canonicalName || !Array.isArray(schemas) || !schemas.length || schemas.some(schema => typeof schema !== 'string' || !schema)) throw new Error(`${label} selection input is invalid.`);
  const matches = [];
  for (let index = 0; index < inventory.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(inventory, index)) throw new Error(`${label} inventory must be dense.`);
    const item = inventory[index]; if (!plain(item) || typeof item.name !== 'string' || !Buffer.isBuffer(item.bytes)) throw new Error(`${label} inventory item is invalid.`);
    let value; try { value = decodeStrictJsonArtifact(item.bytes, `${label} ${item.name}`).parsed; } catch (_) { continue; }
    if (plain(value) && schemas.includes(value.schema)) matches.push({ item, value });
  }
  if (matches.length !== 1 || matches[0].item.name !== canonicalName) throw new Error(`${label} must have one exact canonical retained artifact.`);
  return { name: canonicalName, value: matches[0].value, bytes: Buffer.from(matches[0].item.bytes) };
}

module.exports = { selectCanonicalRetainedJson };
