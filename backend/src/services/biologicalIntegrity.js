'use strict';
const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function encode(value) { return JSON.stringify(canonical(value)); }
function digest(value) { return crypto.createHash('sha256').update(encode(value)).digest('hex'); }
function identity(value) {
  const hex = digest(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
module.exports = { canonical, encode, digest, identity };
