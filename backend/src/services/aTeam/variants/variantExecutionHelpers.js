'use strict';

function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function coded(message, code) { return Object.assign(new Error(message), { code }); }
function timestamp(value) {
  if (Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
module.exports = { isRecord, canonicalJson, coded, timestamp };
