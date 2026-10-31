'use strict';

const { types: utilTypes } = require('util');

function snapshotPlainJson(value, label = 'value', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`${label} must contain only finite numbers.`); return value; }
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || utilTypes.isProxy(value)) throw new Error(`${label} must contain only non-proxy JSON data.`);
  if (ancestors.has(value)) throw new Error(`${label} must not be circular.`);
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) throw new Error(`${label} must contain only plain JSON objects and arrays.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length) throw new Error(`${label} must not contain symbol properties.`);
  const keys = Object.keys(descriptors).filter((key) => !(array && key === 'length'));
  if (keys.includes('__proto__')) throw new Error(`${label} must not contain __proto__.`);
  if (array && (keys.some((key) => !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) || keys.length !== value.length)) throw new Error(`${label} arrays must be dense and contain no extra properties.`);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error(`${label}.${key} must be an enumerable data property, not an accessor.`);
  }
  ancestors.add(value);
  const result = array ? Array.from({ length: value.length }, (_, index) => snapshotPlainJson(descriptors[String(index)].value, `${label}[${index}]`, ancestors)) : Object.fromEntries(keys.sort().map((key) => [key, snapshotPlainJson(descriptors[key].value, `${label}.${key}`, ancestors)]));
  ancestors.delete(value);
  return result;
}

module.exports = { snapshotPlainJson };
