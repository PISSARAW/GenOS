'use strict';

const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function error(code) { return Object.assign(new Error(code), { code }); }
function sameScope(left, right) {
  return ['organizationId', 'projectId', 'entityId'].every((key) => left?.[key] && left[key] === right?.[key]);
}

module.exports = { canonical, hash, error, sameScope };
