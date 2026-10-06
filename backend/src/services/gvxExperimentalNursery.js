'use strict';

const protocol = require('./gvxExperimentProtocol');
const verifierRegistry = require('./gvxVerifierRegistry');
const ledger = require('./gvxDevelopmentLedger');

function validAdapters(options) {
  return typeof options.createIsolatedWorld === 'function' && typeof options.runWorld === 'function'
    && typeof options.artifactReader === 'function';
}

async function buildWorld(options, arm) {
  const world = await options.createIsolatedWorld({ arm, snapshotHash: options.plan.snapshotHash,
    budget: options.plan.worldBudget, controls: options.plan.controls });
  if (world?.worldId !== arm.worldId || world.isolationId !== arm.isolationId) throw new Error('nursery-isolation-contract-failed');
  return world;
}

async function verifyOutcome(context) {
  const { options, arm, world, outcome } = context;
  const metrics = verifiedMetrics(outcome?.metrics, options.metricAllowlist);
  if (!Array.isArray(outcome?.evidence)) return { ...outcome, worldId: world.worldId,
    armId: arm.armId, role: arm.role, metrics, metricsVerified: false };
  const verified = [];
  for (const item of outcome.evidence) {
    const receipt = await verifierRegistry.verifyEvidence({ registry: options.verifierRegistry,
      artifactReader: options.artifactReader, evidence: item, requirement: item.requirement });
    if (receipt.verified) verified.push(receipt);
  }
  require('./gvxNurseryAttestation').validate({ options, arm, outcome, evidence: verified });
  return { worldId: world.worldId, status: outcome.status, cost: outcome.cost,
    isolationAttestation: outcome.isolationAttestation || null,
    evidence: verified, armId: arm.armId, role: arm.role, metrics,
    metricsVerified: metricsVerified(metrics, verified) };
}

function verifiedMetrics(metrics, allowlist = []) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return {};
  const allowed = new Set(allowlist);
  return Object.fromEntries(Object.entries(metrics).filter(([key, value]) => allowed.has(key)
    && (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && value.length <= 500) || validNumericVector(value))));
}

function validNumericVector(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 128
    && value.every((item) => Number.isFinite(Number(item)));
}

function metricsVerified(metrics, evidence) {
  const covered = new Set(evidence.map((item) => item.requirement).filter((value) => value.startsWith('metric:'))
    .map((value) => value.slice('metric:'.length)));
  const names = Object.keys(metrics);
  return names.length > 0 && names.every((name) => covered.has(name));
}

async function run(options) {
  if (!validAdapters(options)) throw new Error('nursery-adapters-required');
  verifierRegistry.validateRegistry(options.verifierRegistry);
  const input = options.input || options;
  const event = await protocol.recordExperimentPlan(options.db, input);
  const plan = event.payload.plan;
  const outcomes = [];
  for (const arm of plan.experimentDesign.arms) {
    outcomes.push(await runArm({ ...options, plan }, arm));
  }
  const finished = await protocol.recordExperimentOutcomes(options.db, { ...input, plan, outcomes });
  return { experimentId: plan.experimentId, startedEventId: event.id, finishedEventId: finished.id,
    assessment: finished.payload.assessment, outcomes, promotionAllowed: false };
}

async function runArm(options, arm) {
  const input = options.input || options;
  const scope = { ...input.scope, entityId: input.entityId };
  const id = `gvx-experiment:${options.plan.experimentId}:arm:${arm.armId}`;
  const prior = await ledger.getEvent(options.db, id, scope);
  if (prior) return prior.payload.outcome;
  const world = await buildWorld(options, arm);
  try {
    const raw = await options.runWorld({ world, arm, budget: arm.budget, controls: options.plan.controls });
    const outcome = await verifyOutcome({ options, arm, world, outcome: raw });
    await ledger.appendEvent(options.db, { id, ...scope, type: 'evidence_attached',
      parentHash: options.plan.snapshotHash, candidateHash: input.candidateHash,
      payload: { kind: 'gvx_experiment_arm', experimentId: options.plan.experimentId, outcome } });
    return outcome;
  } finally { if (options.disposeIsolatedWorld) await options.disposeIsolatedWorld(world); }
}

module.exports = { run, validAdapters, buildWorld, verifyOutcome, verifiedMetrics, metricsVerified };
