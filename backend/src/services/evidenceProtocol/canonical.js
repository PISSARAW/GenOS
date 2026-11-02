'use strict';

const crypto = require('node:crypto');

function normalizeArray(value, context) {
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor) throw new Error('Sparse arrays are not JSON values.');
    if (!Object.hasOwn(descriptor, 'value')) throw new Error('JSON accessors are forbidden.');
    result.push(normalize(descriptor.value, context));
  }
  return `[${result.join(',')}]`;
}

function normalizeObject(value, context) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Only plain JSON objects are allowed.');
  }
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol keys are not JSON.');
  const result = [];
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value')) throw new Error('JSON accessors are forbidden.');
    result.push(`${JSON.stringify(key)}:${normalize(descriptor.value, context)}`);
  }
  return `{${result.join(',')}}`;
}

function normalizeContainer(value, context) {
  if (context.seen.has(value)) throw new Error('Cyclic JSON value.');
  if (context.depth >= 64) throw new Error('JSON nesting exceeds 64 levels.');
  context.seen.add(value);
  context.depth += 1;
  const result = Array.isArray(value) ? normalizeArray(value, context) : normalizeObject(value, context);
  context.depth -= 1;
  context.seen.delete(value);
  return result;
}

function normalize(value, context) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean' || type === 'string') return JSON.stringify(value);
  if (type === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (type === 'object') return normalizeContainer(value, context);
  throw new Error('Only finite JSON values are allowed.');
}

function canonicalize(value) {
  return normalize(value, { seen: new Set(), depth: 0 });
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;
}

module.exports = { canonicalize, digest };
