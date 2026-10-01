'use strict';

const { createHash, randomUUID } = require('node:crypto');
const guard = require('../counterfactualCandidateGuard');
const frameAdapter = require('./counterfactualFrameAdapter');
const triggerPolicy = require('../counterfactualTriggerPolicyService');
const candidatePool = require('../candidatePoolService');
const persistence = require('../agowStatePersistenceService');
const workspace = require('../../globalWorkspaceService');

const RECEIPT_SCOPE = 'agow_shadow_receipts';
const MAX_FRAMES = 3;
const MAX_QUERIES = 3;
const MAX_WORKERS = 2;
const MAX_BRANCHES = 3;
let registeredExecutor = null;

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cappedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Math.max(0, Math.min(maximum, Math.floor(Number.isFinite(parsed) ? parsed : fallback)));
}

function limits(options) {
  const cost = Number(options.maxCost);
  return { maxFrames: cappedInteger(options.maxFrames, MAX_FRAMES, MAX_FRAMES),
    maxQueries: cappedInteger(options.maxQueries, MAX_QUERIES, MAX_QUERIES),
    maxWorkers: cappedInteger(options.maxWorkers, MAX_WORKERS, MAX_WORKERS),
    maxCost: Number.isFinite(cost) ? Math.max(0, Math.min(1, cost)) : 1 };
}

function registerExecutor(handler) {
  if (typeof handler !== 'function') throw new TypeError('AGOW shadow executor must be a function.');
  registeredExecutor = handler;
  return () => { registeredExecutor = null; };
}

function resolveExecutor(options) {
  return typeof options.execute === 'function' ? options.execute : registeredExecutor;
}

function validateOptions(options) {
  if (!options?.frame?.agentId || !options.frame.frameId || !options.db?.get || !options.db?.run) {
    throw new TypeError('AGOW shadow simulation requires a real frame and backend database.');
  }
}

function snapshotValue(options) {
  return structuredClone(options.snapshot || { frame: options.frame, candidates: options.candidates });
}

async function createSnapshot(options) {
  const snapshot = snapshotValue(options);
  const snapshotHash = digest(snapshot);
  const snapshotId = await require('../../counterfactual/counterfactualPlanner').snapshotProductionState({
    db: options.db, agentId: options.frame.agentId, reason: 'agow_counterfactual_shadow',
    topology: { runtime: 'agow', parentFrameId: options.frame.frameId },
    stateMetadata: { parentFrameId: options.frame.frameId, snapshotHash }
  });
  return { snapshot, snapshotHash, snapshotId };
}

async function persistReceipt(options, receipt) {
  const loaded = await persistence.load({ scope: RECEIPT_SCOPE, agentId: options.frame.agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  receipts.push(receipt);
  await persistence.save({ scope: RECEIPT_SCOPE, agentId: options.frame.agentId, db: loaded.db,
    state: { receipts: receipts.slice(-100) }, version: receipts.length });
}

async function seedBranch(options) {
  const candidates = frameAdapter.candidatesForBranch({
    branch: options.branch, candidates: options.candidates, simulationId: options.simulationId,
    simulationAgentId: options.simulationAgentId, parentFrameId: options.frame.frameId, now: Date.now()
  });
  for (const candidate of candidates) {
    const receipt = await candidatePool.submit({ candidate, db: options.db, now: candidate.producedAt });
    if (!receipt.accepted) throw new Error(`Shadow candidate rejected: ${receipt.reason}`);
  }
  return candidates;
}

async function runCognitiveLoop(options) {
  const cycles = [];
  const frameIds = new Set();
  let queryCount = 0;
  for (let attempt = 0; attempt < options.limits.maxFrames; attempt += 1) {
    const result = await workspace.cycle({
      agentId: options.simulationAgentId, db: options.db, activeGoal: options.parentFrame.activeGoal,
      unresolvedQuestions: options.parentFrame.unresolvedQuestions, maxQueryCost: options.limits.maxCost,
      allowActiveQuery: queryCount < options.limits.maxQueries, skipTransport: true,
      realityMode: 'counterfactual', simulationId: options.simulationId,
      parentRealityFrameId: options.parentFrame.frameId, counterfactual: false
    });
    cycles.push(result);
    if (result.frame?.frameId) frameIds.add(result.frame.frameId);
    if (result.activeQuery?.planned) queryCount += 1;
    if (!result.activeQuery?.result?.returnedAsCandidates) break;
  }
  return { cycles, frames: [...frameIds], queryCount, frame: cycles.at(-1)?.frame || null };
}

function validateSuccess(outcome) {
  if (!outcome || typeof outcome.success !== 'boolean') throw new TypeError('Shadow executor must return a boolean success outcome.');
}

function validateUncertainty(outcome) {
  if (!Number.isFinite(outcome.uncertainty) || outcome.uncertainty < 0 || outcome.uncertainty > 1) throw new TypeError('Shadow outcome uncertainty must be between 0 and 1.');
}

function validateCost(outcome, budget) {
  if (!Number.isFinite(outcome.cost) || outcome.cost < 0 || outcome.cost > budget.maxCost) throw new RangeError('Shadow outcome exceeded its cost budget.');
}

function validateWorkers(outcome, budget) {
  if (!Number.isInteger(outcome.workersUsed) || outcome.workersUsed < 0 || outcome.workersUsed > budget.maxWorkers) throw new RangeError('Shadow outcome exceeded its worker budget.');
}

function validateEvidence(outcome) {
  if (!Array.isArray(outcome.evidenceRefs) || outcome.evidenceRefs.some((ref) => typeof ref !== 'string')) throw new TypeError('Shadow outcome evidenceRefs must be strings.');
}

function validateOutcome(outcome, budget) {
  validateSuccess(outcome);
  validateUncertainty(outcome);
  validateCost(outcome, budget);
  validateWorkers(outcome, budget);
  validateEvidence(outcome);
  return outcome;
}

async function simulateBranch(options) {
  const simulationId = randomUUID();
  const namespace = guard.registerSimulation({ simulationId, realAgentId: options.frame.agentId,
    parentRealityFrameId: options.frame.frameId });
  const branchOptions = { ...options, simulationId, simulationAgentId: namespace.simulationAgentId };
  try {
    const seeded = await seedBranch(branchOptions);
    const cognitive = await runCognitiveLoop(branchOptions);
    return await completeBranch({ ...branchOptions, namespace, seeded, cognitive });
  } finally {
    await options.db.run('DELETE FROM adaptive_state_events WHERE key = ?', namespace.simulationAgentId);
    await options.db.run('DELETE FROM adaptive_state WHERE key = ?', namespace.simulationAgentId);
    guard.releaseSimulation(simulationId);
  }
}

async function completeBranch(options) {
  const outcome = validateOutcome(await options.execute({
    branch: options.branch, simulationId: options.simulationId, namespace: options.namespace.simulationAgentId,
    parentFrame: options.frame, frame: options.cognitive.frame, frames: options.cognitive.frames,
    queries: options.cognitive.queryCount, snapshot: structuredClone(options.snapshot),
    environment: options.environment || null, budget: options.limits
  }), options.limits);
  return { receiptId: `agow-shadow:${options.simulationId}`, simulationId: options.simulationId,
    realAgentId: options.frame.agentId, parentFrameId: options.frame.frameId,
    snapshotId: options.snapshotId, snapshotHash: options.snapshotHash, branch: options.branch,
    candidateIds: options.seeded.map((candidate) => candidate.candidateId),
    frameIds: options.cognitive.frames, queryCount: options.cognitive.queryCount,
    outcome, createdAt: Date.now(), status: 'completed' };
}

async function publishOutcome(options, receipt) {
  if (!options.publishOutcomes) return { published: false, reason: 'shadow_mode' };
  return require('./counterfactualOutcomeService').publish({ receipt, parentFrame: options.frame,
    agentId: options.frame.agentId, db: options.db });
}

async function runTriggered(options) {
  validateOptions(options);
  const decision = triggerPolicy.shouldSimulate(options);
  if (!decision.triggered) return { triggered: false, simulations: [], reason: 'simulation_gate_closed' };
  const execute = resolveExecutor(options);
  if (!execute) return { triggered: true, simulations: [], reason: 'executor_unavailable', triggeredBy: decision.triggeredBy };
  const budget = limits(options);
  const base = await createSnapshot(options);
  const branches = frameAdapter.branchDefinitions(options.frame, options.candidates).slice(0, MAX_BRANCHES);
  const simulations = [];
  for (const branch of branches) {
    const result = await simulateBranch({ ...options, ...base, branch, execute, limits: budget });
    await persistReceipt(options, result);
    const admission = await publishOutcome({ ...options, publishOutcomes: options.publishOutcomes }, result);
    simulations.push({ ...result, admission });
  }
  return { triggered: true, triggeredBy: decision.triggeredBy, snapshotId: base.snapshotId,
    snapshotHash: base.snapshotHash, limits: budget, simulations };
}

module.exports = { registerExecutor, runTriggered, validateOutcome, limits, RECEIPT_SCOPE };
