'use strict';

const crypto = require('crypto');

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = normalize(value[key]);
    return result;
  }, {});
}

function canonicalJson(value) {
  return JSON.stringify(normalize(value ?? {}));
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

module.exports = { canonicalJson, digest };
