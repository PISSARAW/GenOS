'use strict';

const experiments = require('./experimentRegistryService');
const claimBoundary = require('./claimBoundaryService');

const INPUT_SCHEMA = 'genos.consciousness-theory-comparison/v1';
const RESULT_SCHEMA = 'genos.consciousness-theory-comparison-result/v1';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const STATUSES = new Set(['supported', 'invalidated', 'confounded', 'not_run', 'unavailable']);
const EXECUTED = new Set(['supported', 'invalidated', 'confounded']);

function reject(message) {
  const error = new TypeError(message);
  error.code = 'CONSCIOUSNESS_THEORY_COMPARISON_INVALID';
  throw error;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) reject(`${name} must be a non-empty string.`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function fingerprint(value) {
  return JSON.stringify(canonical(value));
}

function expectedHypotheses() {
  return experiments.getRegistry().theories.flatMap((theory) => theory.hypotheses.map((hypothesis) => ({
    theoryId: theory.id,
    hypothesisId: hypothesis.id
  })));
}

function validateManifest(manifest) {
  if (!manifest) reject('Each observation requires an experiment manifest.');
  const rebuilt = experiments.createManifest({
    hypothesisId: manifest.hypothesisId,
    profileId: manifest.profileId,
    revision: manifest.revision,
    seeds: manifest.seeds,
    locks: manifest.locks,
    thresholds: manifest.thresholds
  });
  if (fingerprint(rebuilt) !== fingerprint(manifest)) reject('Experiment manifest was altered.');
}

function validateEvidenceRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0 || new Set(refs).size !== refs.length) {
    reject('Each observation requires unique evidenceRefs.');
  }
  refs.forEach((ref) => requireText(ref, 'evidenceRef'));
}

function validateObservation(observation) {
  validateManifest(observation?.manifest);
  if (!HASH_PATTERN.test(observation.resultHash || '')) reject('resultHash must be a lowercase SHA-256 hash.');
  if (!STATUSES.has(observation.status)) reject('Unknown observation status.');
  const hasEffect = Number.isFinite(observation.primaryEffect);
  if (EXECUTED.has(observation.status) !== hasEffect) reject('Executed observations require a finite primaryEffect.');
  if (!EXECUTED.has(observation.status) && observation.primaryEffect !== null) {
    reject('Unassessed observations require a null primaryEffect.');
  }
  validateEvidenceRefs(observation.evidenceRefs);
}

function validateCoverage(observations) {
  const expected = expectedHypotheses().map((item) => item.hypothesisId).sort();
  const actual = observations.map((item) => item.manifest.hypothesisId).sort();
  if (fingerprint(actual) !== fingerprint(expected)) reject('Each architecture must cover every registered hypothesis exactly once.');
}

function validateArchitecture(architecture) {
  requireText(architecture?.architectureId, 'architectureId');
  if (!HASH_PATTERN.test(architecture.configurationHash || '')) {
    reject('configurationHash must be a lowercase SHA-256 hash.');
  }
  if (!Array.isArray(architecture.observations)) reject('Architecture observations are required.');
  architecture.observations.forEach(validateObservation);
  validateCoverage(architecture.observations);
}

function runContract(manifest) {
  return {
    profileId: manifest.profileId,
    revision: manifest.revision,
    seeds: manifest.seeds,
    locks: manifest.locks
  };
}

function observationMap(architecture) {
  return new Map(architecture.observations.map((item) => [item.manifest.hypothesisId, item]));
}

function validateComparability(architectures) {
  const reference = architectures[0];
  const contract = fingerprint(runContract(reference.observations[0].manifest));
  const manifests = observationMap(reference);
  for (const architecture of architectures) {
    for (const observation of architecture.observations) {
      if (fingerprint(runContract(observation.manifest)) !== contract) reject('All observations must share revision, profile, seeds and locks.');
      const expected = manifests.get(observation.manifest.hypothesisId)?.manifest;
      if (fingerprint(observation.manifest) !== fingerprint(expected)) reject('Hypothesis manifests must match across architectures.');
    }
  }
}

function validateInput(input) {
  if (input.schema !== INPUT_SCHEMA) reject('Unknown theory comparison schema.');
  requireText(input.comparisonId, 'comparisonId');
  if (!Array.isArray(input.architectures) || input.architectures.length < 2) reject('At least two architectures are required.');
  input.architectures.forEach(validateArchitecture);
  const ids = input.architectures.map((item) => item.architectureId);
  const hashes = input.architectures.map((item) => item.configurationHash);
  if (new Set(ids).size !== ids.length) reject('Architecture IDs must be distinct.');
  if (new Set(hashes).size !== hashes.length) reject('Architecture configurations must be distinct.');
  validateComparability(input.architectures);
}

function matrix(input) {
  return expectedHypotheses().map(({ theoryId, hypothesisId }) => {
    const entries = input.architectures.map((architecture) => {
      const observation = observationMap(architecture).get(hypothesisId);
      return {
        architectureId: architecture.architectureId,
        status: observation.status,
        primaryEffect: observation.primaryEffect,
        resultHash: observation.resultHash,
        evidenceRefs: [...observation.evidenceRefs]
      };
    });
    return {
      theoryId,
      hypothesisId,
      metric: observationMap(input.architectures[0]).get(hypothesisId).manifest.protocol.primaryOutcome.metric,
      agreement: new Set(entries.map((entry) => entry.status)).size === 1,
      entries
    };
  });
}

function coverage(architecture) {
  const observedCount = architecture.observations.filter((item) => EXECUTED.has(item.status)).length;
  return {
    architectureId: architecture.architectureId,
    observedCount,
    unassessedCount: architecture.observations.length - observedCount
  };
}

function compare(input = {}) {
  validateInput(input);
  const reference = input.architectures[0].observations[0].manifest;
  return {
    schema: RESULT_SCHEMA,
    comparisonId: input.comparisonId,
    runContract: runContract(reference),
    architectureCount: input.architectures.length,
    coverage: input.architectures.map(coverage),
    matrix: matrix(input),
    comparable: true,
    rankedWinner: null,
    aggregateConsciousnessScore: null,
    epistemicBoundary: claimBoundary.boundary(),
    promotionAllowed: false,
    limitation: 'Comparaison descriptive de résultats fonctionnels déclarés : elle ne vérifie pas les runs sous-jacents et ne mesure ni conscience ni expérience subjective.'
  };
}

module.exports = { compare, validateInput };
