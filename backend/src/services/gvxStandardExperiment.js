'use strict';

const remoteClient = require('./gvxRemoteVerifierClient');
const registry = require('./gvxVerifierRegistry');
const { hash, error, sameScope } = require('./gvxContracts');

async function evaluate(context, input) {
  const measurement = await remoteClient.signedRequest({ ...context.remote, endpoint: '/v1/evaluate',
    timeoutMs: (context.profile.maxSeconds + 10) * 1000,
    payload: { profileId: context.profile.id, scope: context.scope, ...input } });
  if (measurement.schema !== 'genos.gvx.execution-evidence/v1' || !sameScope(measurement.scope, context.scope)
      || measurement.profileHash !== context.profile.profileHash || measurement.arm !== input.arm
      || measurement.isolationId !== input.operationId) throw error('GVX_EVALUATION_RESPONSE_MISMATCH');
  const bytes = Buffer.from(JSON.stringify(measurement));
  const stored = await context.store.write({ bytes });
  const evidence = context.profile.metrics.flatMap((metric) => [`metric:${metric}`, `gvx-somatic-metric:${metric}`])
    .map((requirement) => ({ ...stored, verifierId: 'gvx-execution-metrics-v1', requirement }));
  return { measurement, evidence, metrics: Object.fromEntries(context.profile.metrics.map((name) => {
    const values = measurement.metrics[name];
    return [name, values.reduce((sum, value) => sum + value, 0) / values.length];
  })) };
}

async function verifiedEvaluation(context, input) {
  const result = await evaluate(context, input);
  const evidence = [];
  for (const item of result.evidence.filter((entry) => entry.requirement.startsWith('gvx-somatic-metric:'))) {
    const receipt = await registry.verifyEvidence({ registry: context.verifierRegistry,
      artifactReader: context.store.read, evidence: item, requirement: item.requirement });
    if (!receipt.verified) throw error('GVX_EXECUTED_METRIC_UNVERIFIED');
    evidence.push(receipt);
  }
  return { ...result, evidence };
}

function experimentInput(context, input) {
  const experimentId = hash({ profile: context.profile.profileHash, operationId: input.operationId });
  const arms = ['baseline', 'candidate'].map((role) => ({ armId: `${experimentId}:${role}`, role,
    worldId: hash({ experimentId, role }), isolationId: `${experimentId}:${role}`,
    snapshotHash: context.profile.parentHash, strategyId: `${context.profile.id}:${role}`, budget: context.profile.maxCost }));
  return { scope: context.scope, entityId: context.scope.entityId, experimentId,
    candidateHash: context.profile.candidateHash, snapshotHash: context.profile.parentHash,
    worldBudget: context.profile.maxCost, controls: context.profile.controls,
    verifierRequirements: context.profile.metrics.map((name) => `gvx-somatic-metric:${name}`),
    experimentDesign: { type: 'paired', arms }, verifierRegistry: context.verifierRegistry,
    artifactReader: context.store.read, metricAllowlist: context.profile.metrics,
    requireAttestation: true,
    createIsolatedWorld: async ({ arm }) => ({ worldId: arm.worldId, isolationId: arm.isolationId }),
    runWorld: async ({ arm, world }) => {
      const result = await evaluate(context, { condition: arm.role, arm: arm.role, operationId: world.isolationId });
      return { status: 'completed', cost: result.measurement.cost, metrics: result.metrics,
        evidence: result.evidence, isolationAttestation: result.measurement };
    } };
}

function comparison(context, outcomes, binding = {}) {
  const sides = {};
  for (const outcome of outcomes) {
    const proofs = outcome.evidence.filter((item) => item.requirement.startsWith('gvx-somatic-metric:'));
    const metrics = Object.fromEntries(proofs.map((item) => {
      const decision = item.signedReceipt.businessDecision;
      return [decision.metric, { mean: decision.mean, samples: decision.samples }];
    }));
    sides[outcome.role] = { metrics, suiteHash: proofs[0]?.signedReceipt.businessDecision.suiteHash };
  }
  const refs = outcomes.flatMap((outcome) => outcome.evidence.map((item) =>
    ({ artifactHash: item.artifactHash, verifierId: item.verifierId })));
  return { ...sides, profile: context.profile.assessmentProfile, scope: context.scope,
    entityId: context.scope.entityId, parentHash: context.profile.parentHash, candidateHash: context.profile.candidateHash,
    evidenceRefs: [...new Map(refs.map((item) => [hash(item), item])).values()],
    binding: { scope: context.scope, profileId: context.profile.id, parentHash: context.profile.parentHash,
      candidateHash: context.profile.candidateHash, contextHash: context.profile.conditions.candidate.contextHash, ...binding } };
}

module.exports = { evaluate, verifiedEvaluation, experimentInput, comparison };
