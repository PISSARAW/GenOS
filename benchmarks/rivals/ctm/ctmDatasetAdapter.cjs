'use strict';

const { createHash } = require('node:crypto');
const DATASETS = new Set(['mustrad', 'ur_funny', 'stable_tool_bench', 'webarena_lite']);
const HASH = /^[a-f0-9]{64}$/;

function validateSource(options) {
  if (!DATASETS.has(options.datasetId) || !options.version || !options.sourceRef
    || (options.sourceFingerprint && !HASH.test(options.sourceFingerprint)) || typeof options.loadRawCases !== 'function'
    || typeof options.normalizeCase !== 'function') {
    throw new TypeError('CTM external dataset source, fingerprint and adapters are required.');
  }
}

async function loadCases(options) {
  validateSource(options);
  const rawCases = await options.loadRawCases({ sourceRef: options.sourceRef,
    datasetId: options.datasetId, split: options.split || 'holdout' });
  if (!Array.isArray(rawCases) || !rawCases.length) throw new TypeError('CTM adapter returned no cases.');
  const sourceFingerprint = createHash('sha256').update(JSON.stringify(rawCases)).digest('hex');
  if (options.sourceFingerprint && options.sourceFingerprint !== sourceFingerprint) {
    throw new TypeError('CTM external dataset fingerprint mismatch.');
  }
  const cases = [];
  for (const rawCase of rawCases) cases.push(await normalizeCase(options, rawCase));
  return { datasetId: options.datasetId, version: String(options.version),
    sourceRef: options.sourceRef, sourceFingerprint,
    split: options.split || 'holdout', caseCount: cases.length, cases };
}

async function normalizeCase(options, rawCase) {
  const item = await options.normalizeCase(rawCase);
  if (!item || typeof item.caseId !== 'string' || !item.caseId.trim()
    || !item.input || typeof item.input !== 'object' || Array.isArray(item.input)) {
    throw new TypeError('CTM normalized case requires caseId and input object.');
  }
  return item;
}

module.exports = { DATASETS, validateSource, loadCases, normalizeCase };
