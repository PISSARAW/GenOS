'use strict';

const crypto = require('node:crypto');
const arena = require('./arenaService');
const { createReceipt } = require('./versionedContractService');
const { persistReceipt } = require('./versionedContractPersistenceService');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateIdentity(spec) {
  if (!spec || typeof spec !== 'object' || !spec.experimentId || !spec.hypothesis) fail('INVALID_EXPERIMENT', 'experimentId and hypothesis are required');
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length < 2 || new Set(seeds).size !== seeds.length) fail('INVALID_SEEDS', 'At least two distinct seeds are required');
}

function validateBudget(budget) {
  if (!Number.isInteger(budget.maxRuns) || budget.maxRuns < 2) fail('INVALID_BUDGET', 'budget.maxRuns must allow two executions');
  if (!Number.isInteger(budget.maxRounds) || budget.maxRounds < 1) fail('INVALID_BUDGET', 'budget.maxRounds must be positive');
}

function validateSpec(spec) {
  validateIdentity(spec);
  validateSeeds(spec.seeds);
  const budget = spec.budget || {};
  validateBudget(budget);
  if (!spec.control || !spec.intervention) fail('INVALID_CONTROLS', 'Control and intervention arms are required');
  return { ...spec, budget };
}

function runArm(input) {
  const { arm, seed, budget, label } = input;
  const options = { ...arm, rounds: budget.maxRounds, seed, solverKeys: arm.solverKeys || undefined };
  const result = arena.runTournament(options);
  const leaderboard = result.leaderboard || [];
  if (!result.topSolver || leaderboard.length === 0) fail('EMPTY_EXECUTION', `${label} execution produced no verified solver result`);
  return { label, seed, tournamentId: result.tournamentId, topSolver: result.topSolver, leaderboard, rounds: budget.maxRounds };
}

function armSignature(arm) {
  return JSON.stringify({
    label: arm.label,
    topSolver: arm.topSolver?.solverKey || null,
    scores: arm.leaderboard.map((entry) => ({ solverKey: entry.solverKey, fitnessScore: entry.fitnessScore, adversarialPassRate: entry.adversarialPassRate })),
  });
}

function summarizeExecutions(executions) {
  const signatures = executions.map(armSignature);
  const first = signatures[0];
  const matching = signatures.filter((signature) => signature === first).length;
  return { executions: executions.length, matchingFirst: matching, agreementRate: matching / executions.length, signatures };
}

function metricsFor(executions) {
  const scores = executions.map((execution) => Number(execution.topSolver.fitnessScore || 0));
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return { meanFitness: Number(mean.toFixed(3)), minFitness: Math.min(...scores), maxFitness: Math.max(...scores), executionCount: executions.length };
}

function buildReceipt(spec, arms, nondeterminism) {
  const controlMetrics = metricsFor(arms.control);
  const interventionMetrics = metricsFor(arms.intervention);
  const delta = Number((interventionMetrics.meanFitness - controlMetrics.meanFitness).toFixed(3));
  return createReceipt('CausalInterventionReceipt', {
    experimentId: spec.experimentId,
    snapshotId: spec.snapshotId || `snapshot_${spec.experimentId}`,
    control: { label: 'control', metrics: controlMetrics },
    intervention: { label: 'intervention', metrics: interventionMetrics },
    seeds: spec.seeds.map((seed) => Number(seed)),
    replicates: spec.seeds.length,
    metricsBefore: controlMetrics,
    metricsAfter: interventionMetrics,
    pairedEffects: { meanFitnessDelta: delta, nondeterminismAgreement: nondeterminism.agreementRate },
    verdict: delta > 0 && nondeterminism.agreementRate >= 0.5 ? 'supported' : 'inconclusive',
    evidenceRefs: spec.evidenceRefs || [`experiment:${spec.experimentId}`],
  }, { runId: spec.runId, sourceRefs: spec.sourceRefs });
}

async function runIsolatedExperiment(input, options = {}) {
  const spec = validateSpec(input);
  if (spec.budget.maxRuns < spec.seeds.length * 2) fail('BUDGET_EXCEEDED', 'Budget must cover control and intervention for every seed');
  const arms = { control: [], intervention: [] };
  for (const seed of spec.seeds) {
    arms.control.push(runArm({ arm: spec.control, seed, budget: spec.budget, label: 'control' }));
    arms.intervention.push(runArm({ arm: spec.intervention, seed, budget: spec.budget, label: 'intervention' }));
  }
  const allExecutions = [...arms.control, ...arms.intervention];
  const nondeterminism = summarizeExecutions(allExecutions);
  const receipt = buildReceipt(spec, arms, nondeterminism);
  if (options.db) await persistReceipt(options.db, receipt);
  return {
    experimentId: spec.experimentId,
    isolation: { control: true, intervention: true, sharedState: false },
    budget: { allocatedRuns: spec.budget.maxRuns, consumedRuns: allExecutions.length, maxRounds: spec.budget.maxRounds },
    arms,
    nondeterminism,
    receipt,
    runHash: crypto.createHash('sha256').update(nondeterminism.signatures.join('|')).digest('hex'),
  };
}

module.exports = { runIsolatedExperiment, validateSpec };
