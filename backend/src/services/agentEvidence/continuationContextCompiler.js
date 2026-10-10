'use strict';

const crypto = require('node:crypto');

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameClaimFields(claims) {
  if (!Array.isArray(claims) || claims.length < 2 || !claims.every(plainObject)) return null;
  const fields = Object.keys(claims[0]);
  if (!fields.includes('statement') || !fields.includes('evidence')) return null;
  const signature = JSON.stringify(fields);
  return claims.every((claim) => JSON.stringify(Object.keys(claim)) === signature) ? fields : null;
}

function columnarReport(report) {
  const fields = sameClaimFields(report.claims);
  if (!fields) return null;
  return { ...report, claims: { fields, rows: report.claims.map((claim) => fields.map((key) => claim[key])) } };
}

function compileEvidenceDelta(value) {
  const report = plainObject(value) ? value : {};
  const original = JSON.stringify(report);
  const candidate = columnarReport(report);
  const compact = candidate ? JSON.stringify(candidate) : null;
  const columnar = Boolean(compact && compact.length < original.length);
  const data = columnar ? compact : original;
  return {
    data,
    encoding: columnar ? 'columnar-claims-v1' : 'json',
    sourceSha256: crypto.createHash('sha256').update(original).digest('hex'),
    sourceChars: original.length,
    contextChars: data.length
  };
}

function decodeEvidenceDelta(compiled) {
  const data = JSON.parse(compiled.data);
  if (compiled.encoding !== 'columnar-claims-v1') return data;
  const { fields, rows } = data.claims;
  return { ...data, claims: rows.map((row) => Object.fromEntries(fields.map((key, index) => [key, row[index]]))) };
}

module.exports = { compileEvidenceDelta, decodeEvidenceDelta };
