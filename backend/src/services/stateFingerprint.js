'use strict';

const crypto = require('crypto');

function canonicalValue(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new TypeError('State must contain only JSON-compatible values.');
  if (ancestors.has(value)) throw new TypeError('State cannot contain circular references.');
  ancestors.add(value);
  const normalized = Array.isArray(value)
    ? value.map((entry) => canonicalValue(entry, ancestors))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key], ancestors)]));
  ancestors.delete(value);
  return normalized;
}

function fingerprint(value) {
  const canonical = JSON.stringify(canonicalValue(value));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = { canonicalValue, fingerprint };
