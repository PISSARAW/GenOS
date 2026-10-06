'use strict';

const crypto = require('node:crypto');

function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function digest(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function contractFingerprint(contract) {
  // Full contract, including limits/provenance: changes invalidate old receipts.
  return digest(contract);
}

module.exports = { canonical, digest, contractFingerprint };
