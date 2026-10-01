'use strict';

const { randomUUID } = require('crypto');
const { appendEvent } = require('./gvxDevelopmentLedger');

const CHAMBERS = Object.freeze(['direct', 'structured', 'falsification']);
const HASH = /^[a-f0-9]{64}$/;

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return ['experiment-object-required'];
  return [
    ...scopeErrors(plan), ...snapshotErrors(plan), ...chamberErrors(plan),
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

function chamberErrors(plan) {
  if (!Array.isArray(plan.worlds) || plan.worlds.length !== 3) return ['three-worlds-required'];
  const ids = plan.worlds.map((world) => world.chamber);
  if (new Set(ids).size !== 3 || CHAMBERS.some((chamber) => !ids.includes(chamber))) return ['world-chambers-invalid'];
  return plan.worlds.flatMap((world) => validateWorld(plan, world));
}

function validateWorld(plan, world) {
  const errors = [];
  if (!world.worldId || !world.isolationId) errors.push('world-identity-required');
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
    worlds: input.worlds.map((world) => ({ ...world, status: 'pending', outcome: null }))
  };
}

async function recordExperimentPlan(db, input) {
  const errors = validatePlan(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_EXPERIMENT_INVALID', errors });
  const plan = preparePlan(input);
  return appendEvent(db, {
    organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    entityId: input.entityId, type: 'experiment_started', parentHash: input.snapshotHash,
    payload: { plan }
  });
}

function assessOutcomes(plan, outcomes) {
  const byWorld = new Map((outcomes || []).map((outcome) => [outcome.worldId, outcome]));
  const results = plan.worlds.map((world) => assessWorld(world, byWorld.get(world.worldId), plan.verifierRequirements));
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
  if (!outcome || outcome.status !== 'completed') return { worldId: world.worldId, status: 'inconclusive', reason: 'world-not-completed' };
  if (!Array.isArray(outcome.evidence) || !outcome.evidence.length) return { worldId: world.worldId, status: 'blocked', reason: 'evidence-missing' };
  const refs = outcome.evidence.filter(validEvidence);
  const covered = new Set(refs.map((item) => item.requirement));
  const missing = requirements.filter((item) => !covered.has(item));
  if (missing.length) return { worldId: world.worldId, status: 'inconclusive', reason: 'verifier-requirements-unmet', missing };
  return { worldId: world.worldId, status: 'complete', evidence: refs };
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
    organizationId: context.scope.organizationId, projectId: context.scope.projectId,
    entityId: context.entityId, type: 'experiment_finished', parentHash: context.plan.snapshotHash,
    payload
  });
}

module.exports = { CHAMBERS, validatePlan, recordExperimentPlan, assessOutcomes, recordExperimentOutcomes };
