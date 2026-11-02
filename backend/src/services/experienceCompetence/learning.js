'use strict';

const consolidation = require('../proceduralConsolidationService');
const predictionError = require('../proceduralPredictionErrorService');
const { digest, ruleValid, validOperator, validateObservation } = require('./contract');

function initial() {
  return { schema: 'genos.verified-procedural-competence/v1', version: 0,
    observations: {}, procedures: {}, calibration: { count: 0, squaredError: 0 }, proposals: [] };
}

function consolidate(op, rule, samples) {
  if (!ruleValid(rule) || new Set(samples.map(row => row.x)).size < 3) return null;
  if (!samples.every(row => rule.a * row.x + rule.b === row.y)) return null;
  const ruleHash = digest({ op, rule });
  const episodes = samples.map(row => ({ id: row.runId, success: true, outcome: 'success',
    trajectory: ['read_verified_observation', ruleHash, 'checked_affine_execution'],
    sourceEpisodeIds: [row.runId] }));
  const result = consolidation.consolidatePath({ consolidation: { minEpisodes: 3, threshold: 1 } }, episodes);
  if (result.consolidated !== true) return null;
  return { rule: { a: rule.a, b: rule.b }, ruleHash, consolidation: result,
    evidenceRefs: samples.map(row => row.runId), support: samples.length };
}

function consider(state, input) {
  if (!validOperator(input.op) || !/^[a-f0-9]{64}$/.test(input.sourceRef || '')) throw Error('Bound model proposal required');
  const next = structuredClone(state);
  const samples = next.observations[input.op] || [];
  const procedure = consolidate(input.op, input.proposal, samples);
  next.proposals.push({ op: input.op, sourceRef: input.sourceRef, proposal: input.proposal,
    accepted: Boolean(procedure), support: samples.length });
  if (procedure) next.procedures[input.op] = { ...procedure, modelSourceRef: input.sourceRef };
  return next;
}

function observe(state, input, verifierDigest) {
  const observation = validateObservation(input, verifierDigest);
  const existing = Object.values(state.observations).flat().find(row => row.runId === observation.runId);
  if (existing) {
    if (digest(existing) !== digest(observation)) throw Error('Conflicting observation replay');
    return state;
  }
  const next = structuredClone(state);
  const samples = next.observations[input.op] || [];
  samples.push(observation);
  next.observations[input.op] = samples;
  const current = next.procedures[input.op];
  if (current) refresh(next, { op: input.op, current, samples });
  next.version++;
  const error = predictionError.computePredictionError({ expectedReward: input.forecast, observedReward: Number(input.correct) });
  next.calibration = { count: next.calibration.count + 1,
    squaredError: next.calibration.squaredError + error.delta ** 2, lastPredictionError: error };
  return next;
}

function refresh(state, input) {
  const updated = consolidate(input.op, input.current.rule, input.samples);
  if (updated) state.procedures[input.op] = { ...updated, modelSourceRef: input.current.modelSourceRef };
  else delete state.procedures[input.op];
}

module.exports = { initial, consolidate, consider, observe };
