'use strict';

const profilesModule = require('./gvxExecutionProfiles');
const records = require('./gvxExecutionEvidence');
const { hash, error, sameScope } = require('./gvxContracts');
const ID = 'gvx-execution-metrics-v1';

function parseMeasurement(stdout, profile) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.startsWith('GVX_MEASUREMENT_JSON:'));
  if (lines.length !== 1) throw error('GVX_EXECUTION_MEASUREMENT_MISSING');
  const measurement = JSON.parse(lines[0].slice('GVX_MEASUREMENT_JSON:'.length));
  const valid = profile.metrics.every((name) => Array.isArray(measurement.metrics?.[name])
    && measurement.metrics[name].length >= profile.assessmentProfile.minSamples
    && measurement.metrics[name].length <= 1000 && measurement.metrics[name].every(Number.isFinite));
  if (!valid || !validCost(measurement.cost, profile.maxCost)) throw error('GVX_EXECUTION_MEASUREMENT_INVALID');
  if (measurement.metrics.safety.some((value) => value < 0 || value > 1)) throw error('GVX_EXECUTION_SAFETY_INVALID');
  return measurement;
}

function validateRequest(input, profile) {
  if (!profile || !sameScope(input.scope, profile.scope) || !profile.conditions[input.condition]
      || !['baseline', 'candidate'].includes(input.arm)) throw error('GVX_EXECUTION_REQUEST_INVALID');
  if (typeof input.operationId !== 'string' || !input.operationId || input.operationId.length > 500) {
    throw error('GVX_EXECUTION_OPERATION_ID_REQUIRED');
  }
}

async function execute(options) {
  const { input, profile, recordOptions } = options;
  const executionId = hash({ profile: profile.profileHash, scope: input.scope,
    condition: input.condition, arm: input.arm, operationId: input.operationId });
  const existing = await records.readRecord(recordOptions, executionId);
  profilesModule.verifySources(profile);
  if (existing) return existing;
  await verifyMonitorState(profile,input);
  const startedAt = new Date().toISOString();
  const result = await executeInWorld(profile,input);
  profilesModule.verifySources(profile);
  if (!result.success || !result.processId) throw error('GVX_EXECUTION_FAILED');
  await verifyMonitorState(profile,input);
  const measurement = parseMeasurement(result.stdout, profile);
  const condition = profile.conditions[input.condition];
  return records.writeRecord(recordOptions, { schema: 'genos.gvx.execution-evidence/v1', executionId,
    profileId: profile.id, profileHash: profile.profileHash, scope: profile.scope, arm: input.arm,
    condition: input.condition, applicationId: input.applicationId || null, observationId: input.observationId || null, suiteHash: condition.suiteHash, contextHash: condition.contextHash || hash(condition.suiteHash),
    parentHash: profile.parentHash, candidateHash: profile.candidateHash,
    snapshotHashObserved: profile.parentHash, toolsetHashObserved: hash(profile.sources),
    environmentHashObserved: profile.profileHash, isolationId: input.operationId,
    processId: result.processId, executionIdentity: result.executionIdentity, commandHash: result.commandHash, durationMs: result.durationMs,
    startedAt, endedAt: new Date().toISOString(), model: profile.model, cost: measurement.cost, metrics: measurement.metrics });
}

async function verifyMetric(options, input) {
  let artifact;
  try { artifact = JSON.parse(input.artifact.toString('utf8')); } catch (_) { return { verified: false }; }
  const profile = options.profiles.find((item) => item.id === artifact.profileId);
  if (!profile || artifact.profileHash !== profile.profileHash || input.evidence.artifactHash !== input.artifactHash) {
    return { verified: false };
  }
  const saved = await records.readRecord(options.recordOptions, artifact.executionId);
  if (!saved || hash(saved) !== hash(artifact)) return { verified: false };
  const metric = input.requirement.replace(/^(gvx-somatic-metric:|metric:)/, '');
  if (!profile.metrics.includes(metric)) return { verified: false };
  const values = saved.metrics[metric];
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return { verified: true, evidenceClass: 'independently_executed_measurement', businessDecision: {
    metric, processId: saved.processId, cost: saved.cost, model: saved.model, durationMs: saved.durationMs,
    arm: saved.arm, applicationId: saved.applicationId, observationId: saved.observationId, condition: saved.condition, mean, value: mean, samples: values.length, suiteHash: saved.suiteHash,
    scope: saved.scope, parentHash: saved.parentHash, candidateHash: saved.candidateHash,
    contextHash: saved.contextHash, profileId: saved.profileId, executionId: saved.executionId,
    isolationId: saved.isolationId, snapshotHashObserved: saved.snapshotHashObserved,
    toolsetHashObserved: saved.toolsetHashObserved, environmentHashObserved: saved.environmentHashObserved
  } };
}

function createEvaluator(config) {
  const profiles = profilesModule.loadProfiles();
  const root = process.env.GENOS_GVX_EXECUTION_STORE;
  if (profiles.length && !root) throw error('GVX_EXECUTION_STORE_REQUIRED');
  const options = { profiles, recordOptions: { ...config, root } };
  const pending = new Map();
  const evaluate = async (input) => {
    const profile = profiles.find((item) => item.id === input.profileId);
    validateRequest(input, profile);
    const key = hash(input);
    if (pending.has(key)) return pending.get(key);
    const task = execute({ input, profile, recordOptions: options.recordOptions });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
  return { profiles, options, evaluate, descriptor: (id) => profilesModule.publicProfile(findProfile(profiles, id)) };
}

function findProfile(profiles, id) {
  const found = profiles.find((item) => item.id === id);
  if (!found) throw error('GVX_EXECUTION_PROFILE_NOT_FOUND');
  return found;
}

function registerEvaluator(evaluator) {
  if (!evaluator.profiles.length) return;
  const trust = require('./verifierTrustRegistry');
  trust.registerVerifier({ id: ID, type: 'benchmark', digest: `sha256:${hash({
    code: trust.computeVerifierDigest(ID, '1.0'), profiles: evaluator.profiles.map((item) => item.profileHash)
  })}`, description: 'Measures a pinned executable evaluator in a process without verifier credentials.' });
  const names = [...new Set(evaluator.profiles.flatMap((item) => item.metrics))];
  require('./gvxVerifierControlPlaneRegistry').registerVerifierImplementation({ id: ID,
    requirements: names.flatMap((name) => [`gvx-somatic-metric:${name}`, `metric:${name}`]),
    verify: (input) => verifyMetric(evaluator.options, input) });
}

module.exports = { ID, createEvaluator, registerEvaluator, parseMeasurement, verifyMetric };

function validCost(cost, budget) { return Number.isFinite(cost) && cost >= 0 && cost <= budget; }

async function verifyMonitorState(profile,input) {
  if(!profile.monitorConditions.includes(input.condition)) return;
  if(input.operationId!==`${input.applicationId}:${input.observationId}:${input.arm}`) throw error('GVX_MONITOR_OPERATION_BINDING_INVALID');
  await require('./gvxRuntimeStateVerification').verifyApplication(profile,input.applicationId);
}

async function executeInWorld(profile,input) {
  const worlds=require('./gvxEvaluationWorld');
  const world=await worlds.create(profile);
  try {
    const result = await require('./sandboxExecutor').runIsolated({ command: profile.conditions[input.condition].command,
    cwd: world.cwd, identity: require('./gvxExecutionIsolation').executionIdentity(profile), timeoutMs: profile.maxSeconds * 1000, env: {
      GENOS_GVX_EVAL_ARM: input.arm, GENOS_GVX_EVAL_CONDITION: input.condition,
      GENOS_GVX_EVAL_POLICY: JSON.stringify(input.arm === 'baseline' ? profile.parentPolicy : profile.candidatePolicy)
    } });

    profilesModule.verifySources({...profile,cwd:world.cwd});
    return result;
  } finally {await worlds.dispose(world);}
}
