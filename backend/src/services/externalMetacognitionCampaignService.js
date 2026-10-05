'use strict';

const crypto = require('node:crypto');

const DATASETS = Object.freeze(['SAD', 'MIRROR']);

function missing(fields) {
  return fields.filter((field) => !field);
}

function manifestHash(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function validateInput(input) {
  const data = input || {};
  const errors = missing([data.datasetId, data.datasetVersion, data.modelVersion, data.protocolVersion]);
  if (!DATASETS.includes(String(data.datasetId || '').toUpperCase())) errors.push('datasetId');
  if (typeof data.datasetReader !== 'function') errors.push('datasetReader');
  if (typeof data.modelRunner !== 'function') errors.push('modelRunner');
  return { data, errors };
}

async function run(input) {
  const { data, errors } = validateInput(input);
  if (errors.length) return { status: 'not_run', datasetId: data.datasetId || null, missing: [...new Set(errors)] };
  const manifest = {
    datasetId: String(data.datasetId).toUpperCase(), version: data.datasetVersion,
    modelVersion: data.modelVersion, protocolVersion: data.protocolVersion,
    corpusHash: data.corpusHash || null, reserved: true
  };
  const cases = await data.datasetReader(manifest);
  if (!Array.isArray(cases) || !cases.length) return { status: 'not_run', manifest, reason: 'empty_or_missing_corpus' };
  const results = [];
  for (const item of cases) results.push(await data.modelRunner(item, manifest));
  return {
    status: 'measured', manifest: { ...manifest, manifestHash: manifestHash(manifest) },
    caseCount: cases.length, results, promotionAllowed: false,
    limitation: 'External benchmark result; it does not establish a consciousness property.'
  };
}

module.exports = { DATASETS, run, validateInput };
