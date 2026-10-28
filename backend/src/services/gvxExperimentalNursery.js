'use strict';

const protocol = require('./gvxExperimentProtocol');
const verifierRegistry = require('./gvxVerifierRegistry');
const ledger = require('./gvxDevelopmentLedger');

function validAdapters(options) {
  return typeof options.createIsolatedWorld === 'function' && typeof options.runWorld === 'function'
    && typeof options.artifactReader === 'function';
}

async function buildWorld(options, arm) {
  const trialRuntime = trialRuntimeContext(options, arm);
  const world = await options.createIsolatedWorld({ arm, snapshotHash: options.plan.snapshotHash,
    budget: options.plan.worldBudget, controls: options.plan.controls, ...trialRuntime });
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
  const input = options.input || options;
  const trialMission = await admitCampaignTrial(options, input);
  verifierRegistry.validateRegistry(options.verifierRegistry);
  const event = await protocol.recordExperimentPlan(options.db, input);
  const plan = event.payload.plan;
  const outcomes = [];
  const runOptions = trialMission ? { ...options, trialMission } : options;
  for (const arm of plan.experimentDesign.arms) {
    outcomes.push(await runArm({ ...runOptions, plan }, arm));
  }
  const finished = await protocol.recordExperimentOutcomes(options.db, { ...input, plan, outcomes });
  return { experimentId: plan.experimentId, startedEventId: event.id, finishedEventId: finished.id,
    assessment: finished.payload.assessment, outcomes, promotionAllowed: false };
}

async function admitCampaignTrial(options, input) {
  const mission = mergeTrialMission(options, input);
  if (!mission) return null;
  const bound = require('./gvxTrialMissionBinding').bindCampaignMission(mission);
  await require('./gvxTrialExecutionAdapter').admit(options.db, bound);
  return bound;
}

async function runArm(options, arm) {
  const input = options.input || options;
  const scope = { ...input.scope, entityId: input.entityId };
  const trialRuntime = trialRuntimeContext(options, arm);
  if (trialRuntime.gvxTrialContext) {
    await require('./gvxTrialExecutionAdapter').admit(options.db,
      { ...trialRuntime.gvxTrialContext.profile, gvxTrialContext: trialRuntime.gvxTrialContext });
  }
  const id = `gvx-experiment:${options.plan.experimentId}:arm:${arm.armId}`;
  const prior = await ledger.getEvent(options.db, id, scope);
  if (prior) return revalidateArm({ options, arm, prior, executeTrial: trialRuntime.executeTrial });
  const world = await buildWorld(options, arm);
  try {
    const raw = await options.runWorld({ world, arm, budget: arm.budget,
      controls: options.plan.controls, ...trialRuntime });
    const outcome = await verifyOutcome({ options, arm, world, outcome: raw });
    await ledger.appendEvent(options.db, { id, ...scope, type: 'evidence_attached',
      parentHash: options.plan.snapshotHash, candidateHash: input.candidateHash,
      payload: { kind: 'gvx_experiment_arm', experimentId: options.plan.experimentId,
        executeTrial: trialRuntime.executeTrial, outcome } });
    return outcome;
  } finally { if (options.disposeIsolatedWorld) await options.disposeIsolatedWorld(world); }
}

async function revalidateArm({ options, arm, prior, executeTrial }) {
  assertCachedExecution(prior, executeTrial);
  const outcome = prior.payload.outcome;
  if (!Array.isArray(outcome?.evidence)) {
    throw Object.assign(new Error('GVX_NURSERY_CACHED_EVIDENCE_INVALID'), { code: 'GVX_NURSERY_CACHED_EVIDENCE_INVALID' });
  }
  if (options.validateCachedOutcome) await options.validateCachedOutcome({ arm, outcome });
  const current = await verifyOutcome({ options, arm, world: { worldId: arm.worldId }, outcome });
  if (JSON.stringify(current.evidence.map(receiptBinding)) !== JSON.stringify(outcome.evidence.map(receiptBinding))
      || current.metricsVerified !== outcome.metricsVerified) {
    throw Object.assign(new Error('GVX_NURSERY_CACHED_EVIDENCE_INVALID'), { code: 'GVX_NURSERY_CACHED_EVIDENCE_INVALID' });
  }
  return outcome;
}

function assertCachedExecution(prior, executeTrial) {
  if (executeTrial && JSON.stringify(prior.payload.executeTrial) !== JSON.stringify(executeTrial)) {
    throw Object.assign(new Error('GVX_NURSERY_CACHED_EXECUTION_MISMATCH'), {
      code: 'GVX_NURSERY_CACHED_EXECUTION_MISMATCH'
    });
  }
}

function receiptBinding(receipt) {
  return [receipt.requirement, receipt.verifierId, receipt.verifierVersion, receipt.artifactRef,
    receipt.artifactHash, receipt.evidenceClass, receipt.signedReceipt?.businessDecision || receipt.businessDecision || null];
}

function mergeTrialMission(options, input) {
  const sources = [options, input, options.trialMission, input.trialMission].filter(isObject);
  if (!sources.some(hasTrialMarker)) return null;
  const selected = options.trialMission || input.trialMission || input;
  const mission = { ...selected };
  for (const key of ['campaignId', 'trialId', 'armId', 'scenarioId', 'seed', 'workspaceSnapshotHash',
    'trialProtocol', 'gvxTrialCampaign', 'gvxTrialContext', 'profileHash']) {
    copyMarker(mission, sources, key);
  }
  if (mission.gvxTrialContext && mission.profileHash
    && mission.profileHash !== mission.gvxTrialContext.profileHash) {
    throw Object.assign(new Error('GVX trial profile hash does not match its context.'), {
      code: 'GVX_TRIAL_CONTEXT_HASH_MISMATCH'
    });
  }
  if (options.trialMission || input.trialMission) mission.gvxTrialCampaign = true;
  return mission;
}

function copyMarker(mission, sources, key) {
  const values = sources.map((source) => source[key]).filter((value) => value !== undefined);
  if (!values.length) return;
  const first = values[0];
  if (values.some((value) => !sameMarker(key, first, value))
    || (mission[key] !== undefined && !sameMarker(key, mission[key], first))) {
    throw Object.assign(new Error('GVX trial mission identity changed.'), { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
  }
  mission[key] = first;
}

function sameMarker(key, left, right) {
  if (key !== 'gvxTrialContext') return left === right;
  return left?.profileHash === right?.profileHash && left?.schema === right?.schema;
}

function hasTrialMarker(source) {
  return Boolean(source.campaignId || source.trialId || source.armId || source.gvxTrialCampaign === true
    || source.trialProtocol || source.trialMission || source.gvxTrialContext || source.profileHash);
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function trialRuntimeContext(options, arm) {
  const input = options.input || options;
  const context = resolveTrialContext(options, input);
  const suppliedHash = resolveTrialProfileHash(options, input, context);
  if (!context) {
    if (suppliedHash) throw Object.assign(new Error('GVX trial profile context is required.'), {
      code: 'GVX_TRIAL_CONTEXT_REQUIRED'
    });
    return { gvxTrialContext: null, profileHash: null };
  }
  const bound = require('./gvxTrialRuntimeProfile').bindContext(context);
  if (bound.profileHash !== suppliedHash) {
    throw Object.assign(new Error('GVX trial profile hash does not match its context.'), {
      code: 'GVX_TRIAL_CONTEXT_HASH_MISMATCH'
    });
  }
  return { gvxTrialContext: bound, profileHash: bound.profileHash,
    executeTrial: buildExecutionContract(bound, options.plan, arm) };
}

function buildExecutionContract(context, plan, arm) {
  if (!arm) return null;
  const profile = context.profile;
  if (profile.workspaceSnapshotHash !== plan?.snapshotHash || profile.armId !== arm.armId
    || arm.budget !== plan.worldBudget || (arm.scenarioId && arm.scenarioId !== profile.scenarioId)
    || (arm.seed !== undefined && arm.seed !== profile.seed)) {
    throw Object.assign(new Error('GVX trial execution binding does not match its profile.'), {
      code: 'GVX_TRIAL_EXECUTION_BINDING_MISMATCH'
    });
  }
  return Object.freeze({ schema: 'genos.gvx.execute-trial/v1', scenarioId: profile.scenarioId,
    seed: profile.seed, armId: profile.armId, profileHash: context.profileHash,
    workspaceSnapshotHash: plan.snapshotHash, budget: arm.budget });
}

function resolveTrialContext(options, input) {
  return options.trialMission?.gvxTrialContext || options.gvxTrialContext || input.gvxTrialContext || null;
}

function resolveTrialProfileHash(options, input, context) {
  return options.profileHash || input.profileHash || context?.profileHash || null;
}

module.exports = { run, validAdapters, buildWorld, runArm, trialRuntimeContext, assertCachedExecution,
  verifyOutcome, verifiedMetrics, metricsVerified };
