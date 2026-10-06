'use strict';

const { randomUUID } = require('crypto');
const { appendEvent } = require('./gvxDevelopmentLedger');

const TRINITY_ARMS = Object.freeze(['direct', 'structured', 'falsification']);
const DESIGN_TYPES = Object.freeze(['paired', 'trinity', 'multi_arm', 'ablation']);
const HASH = /^[a-f0-9]{64}$/;

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return ['experiment-object-required'];
  return [
    ...scopeErrors(plan), ...snapshotErrors(plan), ...designErrors(plan),
    ...budgetErrors(plan), ...controlErrors(plan)
  ];
}

function scopeErrors(plan) {
  if (!plan.scope || !plan.scope.organizationId || !plan.scope.projectId || !plan.entityId) return ['experiment-scope-required'];
  return [];
}

function snapshotErrors(plan) {
  if (!HASH.test(plan.snapshotHash || '')) return ['experiment-snapshot-hash-required'];
  return [];
}

function designErrors(plan) {
  const design = plan.experimentDesign;
  if (!design || !DESIGN_TYPES.includes(design.type)) return ['experiment-design-type-invalid'];
  if (!Array.isArray(design.arms) || design.arms.length < 2) return ['experiment-arms-required'];
  if (design.arms.some((arm) => !arm || typeof arm !== 'object' || Array.isArray(arm))) return ['experiment-arm-object-required'];
  return [...armRoleErrors(design), ...design.arms.flatMap((arm) => validateArm(plan, arm)),
    ...duplicateErrors(design.arms)];
}

function duplicateErrors(arms) {
  const fields = [['armId', 'experiment-arm-ids-duplicate'], ['worldId', 'experiment-world-ids-duplicate'],
    ['role', 'experiment-arm-roles-duplicate'], ['isolationId', 'experiment-isolation-ids-duplicate']];
  return fields.filter(([field]) => new Set(arms.map((arm) => arm[field])).size !== arms.length)
    .map(([, error]) => error);
}

function armRoleErrors(design) {
  const roles = design.arms.map((arm) => arm.role);
  const expected = { paired: ['baseline', 'candidate'], trinity: [...TRINITY_ARMS],
    ablation: ['full', 'mechanism_removed'] }[design.type];
  if (expected && (roles.length !== expected.length || expected.some((role) => !roles.includes(role)))) {
    return [`experiment-${design.type}-roles-invalid`];
  }
  return roles.every((role) => typeof role === 'string' && role.trim()) ? [] : ['experiment-arm-role-required'];
}

function validateArm(plan, world) {
  const errors = [];
  if (!world.armId || !world.role || !world.worldId || !world.isolationId) errors.push('world-identity-required');
  if (world.snapshotHash !== plan.snapshotHash) errors.push('world-snapshot-mismatch');
  if (!world.strategyId || !Number.isFinite(world.budget) || world.budget !== plan.worldBudget) errors.push('world-control-mismatch');
  return errors;
}

function budgetErrors(plan) {
  return Number.isFinite(plan.worldBudget) && plan.worldBudget > 0 ? [] : ['positive-world-budget-required'];
}

function controlErrors(plan) {
  const errors = [];
  if (!plan.controls || !plan.controls.model || !plan.controls.toolsetHash || !plan.controls.environmentHash) errors.push('matched-controls-required');
  if (!Array.isArray(plan.verifierRequirements) || !plan.verifierRequirements.length) errors.push('verifier-requirements-required');
  return errors;
}

function preparePlan(input) {
  return {
    experimentId: input.experimentId || randomUUID(),
    protocolVersion: 1,
    snapshotHash: input.snapshotHash,
    worldBudget: input.worldBudget,
    controls: { ...input.controls },
    verifierRequirements: [...new Set(input.verifierRequirements)],
    experimentDesign: { type: input.experimentDesign.type,
      arms: input.experimentDesign.arms.map((arm) => ({ ...arm, status: 'pending', outcome: null })) }
  };
}

async function recordExperimentPlan(db, input) {
  const errors = validatePlan(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_EXPERIMENT_INVALID', errors });
  const plan = preparePlan(input);
  return appendEvent(db, {
    id: `gvx-experiment:${plan.experimentId}:started`, candidateHash: input.candidateHash,
    organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    entityId: input.entityId, type: 'experiment_started', parentHash: input.snapshotHash,
    payload: { plan }
  });
}

function assessOutcomes(plan, outcomes) {
  const byWorld = new Map((outcomes || []).map((outcome) => [outcome.worldId, outcome]));
  const results = plan.experimentDesign.arms.map((arm) => assessWorld(arm,
    byWorld.get(arm.worldId), plan.verifierRequirements));
  const blocked = results.some((result) => result.status === 'blocked');
  const incomplete = results.some((result) => result.status !== 'complete');
  return {
    experimentId: plan.experimentId,
    status: blocked ? 'blocked' : incomplete ? 'inconclusive' : 'ready_for_independent_review',
    promotionAllowed: false,
    results
  };
}

function assessWorld(world, outcome, requirements) {
  const identity = { armId: world.armId, role: world.role, worldId: world.worldId };
  if (!outcome || outcome.status !== 'completed') return { ...identity, status: 'inconclusive', reason: 'world-not-completed' };
  if (outcome.metricsVerified === false && Object.keys(outcome.metrics || {}).length) {
    return { ...identity, status: 'blocked', reason: 'metrics-unverified' };
  }
  if (!Array.isArray(outcome.evidence) || !outcome.evidence.length) return { ...identity, status: 'blocked', reason: 'evidence-missing' };
  const refs = outcome.evidence.filter(validEvidence);
  const covered = new Set(refs.map((item) => item.requirement));
  const missing = requirements.filter((item) => !covered.has(item));
  if (missing.length) return { ...identity, status: 'inconclusive', reason: 'verifier-requirements-unmet', missing };
  return { ...identity, status: 'complete', evidence: refs };
}

function validEvidence(item) {
  return Boolean(item && item.requirement && item.verifierId && HASH.test(item.artifactHash || ''));
}

function buildFinishedPayload(plan, outcomes) {
  const assessment = assessOutcomes(plan, outcomes);
  return { plan, outcomes, assessment };
}

async function recordExperimentOutcomes(db, context) {
  const payload = buildFinishedPayload(context.plan, context.outcomes);
  return appendEvent(db, {
    id: `gvx-experiment:${context.plan.experimentId}:finished`, candidateHash: context.candidateHash,
    organizationId: context.scope.organizationId, projectId: context.scope.projectId,
    entityId: context.entityId, type: 'experiment_finished', parentHash: context.plan.snapshotHash,
    payload
  });
}

module.exports = { TRINITY_ARMS, DESIGN_TYPES, validatePlan, recordExperimentPlan, assessOutcomes, recordExperimentOutcomes };
