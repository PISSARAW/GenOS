'use strict';

const { createHash } = require('node:crypto');

// A bounded typed preimage for hashing, NOT a transport/serialization protocol.
// Tags and byte lengths prevent concatenation ambiguities. No prompts or JSON.
function digest(value) {
  const hash = createHash('sha256');
  const state = { hash, count: 0, bytes: 0, ancestors: new Set() };
  visit(value, state, 0);
  return hash.digest('hex');
}

function token(state, type, text = '') {
  state.bytes += Buffer.byteLength(text, 'utf8');
  if (state.bytes > 8 * 1024 * 1024) throw new Error('RPE_CANONICAL_BYTE_LIMIT');
  const bytes = Buffer.from(text, 'utf8');
  state.hash.update(`${type}${bytes.length}:`);
  state.hash.update(bytes);
}

function visit(value, state, depth) {
  if (depth > 32 || ++state.count > 100000) throw new Error('RPE_CANONICAL_LIMIT');
  if (value === null) return token(state, 'n');
  if (typeof value === 'string') return token(state, 's', value);
  if (typeof value === 'boolean') return token(state, 'b', value ? '1' : '0');
  if (typeof value === 'number') return numberToken(value, state);
  if (typeof value !== 'object') throw new Error('RPE_UNSUPPORTED_VALUE');
  objectToken(value, state, depth);
}

function numberToken(value, state) {
  if (!Number.isFinite(value)) throw new Error('RPE_NON_FINITE_NUMBER');
  token(state, 'd', Object.is(value, -0) ? '0' : String(value));
}

function objectToken(value, state, depth) {
  if (state.ancestors.has(value)) throw new Error('RPE_CYCLIC_VALUE');
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    token(state, '[', String(value.length));
    value.forEach((entry) => visit(entry, state, depth + 1));
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error('RPE_NON_PLAIN_OBJECT');
    const keys = Object.keys(value).sort();
    token(state, '{', String(keys.length));
    keys.forEach((key) => { token(state, 'k', key); visit(value[key], state, depth + 1); });
  }
  state.ancestors.delete(value);
}

module.exports = { digest };
