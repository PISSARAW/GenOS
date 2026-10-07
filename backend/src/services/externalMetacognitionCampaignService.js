'use strict';

const crypto = require('node:crypto');
const deadline = require('./benchmarkDeadlineService');
const SOURCES = Object.freeze({
  SAD: 'https://github.com/LRudL/sad',
  MIRROR: 'https://github.com/Jason-Wang313/Mirror'
});
const DATASETS = Object.freeze(Object.keys(SOURCES));
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function validateInput(input) {
  const data = Object.freeze({ ...(input || {}), maxCaseMs: input?.maxCaseMs ?? 30000 });
  const errors = ['datasetVersion', 'modelVersion', 'protocolVersion', 'metricId']
    .filter((key) => typeof data[key] !== 'string' || !data[key].trim());
  if (!DATASETS.includes(data.datasetId)) errors.push('datasetId');
  if (!/^[a-f0-9]{64}$/.test(data.corpusHash || '')) errors.push('corpusHash');
  if (!/^[a-f0-9]{40}$/.test(data.sourceRevision || '')) errors.push('sourceRevision');
  if (SOURCES[data.datasetId] !== data.sourceUrl) errors.push('sourceUrl');
  errors.push(...runnerErrors(data));
  return { data, errors };
}

function runnerErrors(data) {
  const errors = ['datasetReader', 'modelRunner', 'scoreRunner'].filter((key) => typeof data[key] !== 'function');
  if (!Number.isSafeInteger(data.maxCases) || data.maxCases < 1) errors.push('maxCases');
  if (data.seed !== undefined && !Number.isSafeInteger(data.seed)) errors.push('seed');
  if (!Number.isSafeInteger(data.maxCaseMs) || data.maxCaseMs < 1 || data.maxCaseMs > 60000) errors.push('maxCaseMs');
  return errors;
}

function validateCases(cases, data) {
  if (!Array.isArray(cases) || !cases.length) return 'empty_or_missing_corpus';
  if (cases.length > data.maxCases) return 'case_budget_exceeded';
  if (digest(cases) !== data.corpusHash) return 'corpus_hash_mismatch';
  if (cases.some((item) => !item?.id || item.input === undefined)) return 'invalid_case';
  if (new Set(cases.map((item) => item.id)).size !== cases.length) return 'duplicate_case';
  return null;
}

function makeManifest(data) {
  return { datasetId: data.datasetId, datasetVersion: data.datasetVersion,
    sourceUrl: data.sourceUrl, sourceRevision: data.sourceRevision, corpusHash: data.corpusHash,
    modelVersion: data.modelVersion, protocolVersion: data.protocolVersion,
    metricId: data.metricId, maxCases: data.maxCases, maxCaseMs: data.maxCaseMs, seed: data.seed ?? null,
    sourceClass: data.sourceClass === 'fixture' ? 'fixture' : 'external_corpus' };
}

async function executeCase(item, context) {
  try {
    // Gold answers remain on the scoring side, not in model inputs.
    const raw = await deadline.run((signal) => context.data.modelRunner(structuredClone(item.input),
      context.manifest, { signal }), context.data.maxCaseMs);
    const response = structuredClone(raw);
    const responseHash = digest(response);
    const scored = await deadline.run((signal) => context.data.scoreRunner({ case: structuredClone(item),
      response: structuredClone(response), manifest: context.manifest, signal }), context.data.maxCaseMs);
    const retained = context.manifest.sourceClass === 'fixture' ? { response } : {};
    if (!Number.isFinite(scored?.score) || scored.score < 0 || scored.score > 1) {
      return { caseId: item.id, status: 'invalid_score', score: null, responseHash, ...retained };
    }
    return { caseId: item.id, status: 'scored', score: scored.score, responseHash, ...retained };
  } catch (error) {
    return { caseId: item.id, status: 'failed', score: null, error: error.code || 'case_execution_failed' };
  }
}

function summarize(results) {
  const scored = results.filter((item) => item.status === 'scored');
  const total = results.length;
  return { total, scored: scored.length, failures: total - scored.length,
    coverage: scored.length / total,
    meanScore: scored.length ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length : null,
    conservativeScore: scored.reduce((sum, item) => sum + item.score, 0) / total };
}

async function run(input) {
  const { data, errors } = validateInput(input);
  if (errors.length) return { status: 'not_run', missing: errors, promotionAllowed: false };
  const manifest = Object.freeze(makeManifest(data));
  let cases;
  try { cases = await deadline.run((signal) => data.datasetReader(manifest, { signal }), data.maxCaseMs); }
  catch (error) { return { status: 'not_run', reason: 'corpus_read_failed', error: error.code || 'corpus_read_failed', promotionAllowed: false }; }
  const reason = validateCases(cases, data);
  if (reason) return { status: 'not_run', manifest, reason, promotionAllowed: false };
  // Pin content before any runner can mutate it.
  const pinned = structuredClone(cases);
  const results = [];
  for (const item of pinned) {
    const halted = results.some((result) => result.error === 'BENCHMARK_TIMEOUT');
    results.push(halted ? { caseId: item.id, status: 'not_run', score: null, error: 'previous_timeout' }
      : await executeCase(item, { data, manifest }));
  }
  const summary = summarize(results);
  const status = manifest.sourceClass === 'fixture' ? 'fixture_evaluated'
    : summary.failures ? 'incomplete' : 'measured';
  const artifact = { manifest, results, summary };
  return { status, ...artifact, manifestHash: digest(manifest), artifactHash: digest(artifact),
    caseCount: pinned.length, promotionAllowed: false,
    limitation: 'Pinned adapter execution, not a claim of complete official benchmark coverage or consciousness.' };
}

module.exports = { DATASETS, SOURCES, run, validateInput, digest };
