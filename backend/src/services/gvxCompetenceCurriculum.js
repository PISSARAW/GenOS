'use strict';

const { appendEvent } = require('./gvxDevelopmentLedger');

async function planCompetenceCurriculum(db, input) {
  validateInput(input);
  const nodes = new Map(input.graph.nodes.map((node) => [node.skillId, node]));
  const prerequisites = prerequisiteMap(input.graph.edges);
  const targets = normalizeTargets(input.targets, nodes);
  const ordered = targets.sort((left, right) => right.priority - left.priority || left.skillId.localeCompare(right.skillId));
  const selected = [];
  const evaluations = [];
  let remainingCost = input.maxCost;
  for (const target of ordered) {
    const result = selected.length >= input.maxSteps
      ? { ...target, status: 'step_limit' }
      : await evaluateTarget({ target, prerequisites, input, remainingCost });
    evaluations.push(result);
    if (result.status !== 'scheduled') continue;
    selected.push(result);
    remainingCost -= result.estimatedCost;
  }
  const plan = {
    schema: 'genos.gvx.competence-curriculum/v1', status: selected.length ? 'proposed' : 'inconclusive',
    maxCost: input.maxCost, estimatedCost: input.maxCost - remainingCost,
    steps: selected, evaluations, graphEventIds: input.graph.sourceEventIds
  };
  const event = await appendEvent(db, {
    organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    entityId: input.entityId, type: 'evidence_attached',
    payload: { kind: 'competence_curriculum_proposal', plan }
  });
  return { ...plan, eventId: event.id };
}

async function evaluateTarget(context) {
  const { target, prerequisites, input, remainingCost } = context;
  if (!await input.authority.isAllowed(target.skillId)) return { ...target, status: 'denied' };
  const required = prerequisites.get(target.skillId) || [];
  const satisfied = await Promise.all(required.map((id) => input.prerequisiteVerifier.isSatisfied(id)));
  if (satisfied.some((value) => value !== true)) return { ...target, status: 'prerequisite_blocked', requires: required };
  const estimatedCost = await input.costEstimator.estimate(target.skillId);
  if (!Number.isFinite(estimatedCost) || estimatedCost <= 0) return { ...target, status: 'cost_unknown' };
  if (estimatedCost > remainingCost) return { ...target, status: 'budget_exceeded', estimatedCost };
  return { ...target, status: 'scheduled', estimatedCost, epistemicStatus: 'hypothesis' };
}

function validateInput(input) {
  if (!validIdentity(input) || !validBudget(input) || !validControlAdapters(input)) {
    throw Object.assign(new Error('GVX curriculum controls are incomplete.'), { code: 'GVX_CURRICULUM_INVALID' });
  }
}

function validIdentity(input) {
  return Boolean(input && input.scope?.organizationId && input.scope?.projectId && input.entityId
    && input.graph?.schema === 'genos.gvx.competence-graph/v1' && Array.isArray(input.targets));
}

function validBudget(input) {
  return Number.isFinite(input.maxCost) && input.maxCost > 0
    && Number.isInteger(input.maxSteps) && input.maxSteps > 0;
}

function validControlAdapters(input) {
  return Boolean(input.authority && typeof input.authority.isAllowed === 'function'
    && input.prerequisiteVerifier && typeof input.prerequisiteVerifier.isSatisfied === 'function'
    && input.costEstimator && typeof input.costEstimator.estimate === 'function');
}

function prerequisiteMap(edges) {
  const result = new Map();
  edges.filter((edge) => edge.relation === 'prerequisite').forEach((edge) => {
    result.set(edge.to, [...(result.get(edge.to) || []), edge.from].sort());
  });
  return result;
}

function normalizeTargets(targets, nodes) {
  const unique = new Set();
  const normalized = targets.map((target) => {
    if (!target || !nodes.has(target.skillId) || !Number.isFinite(target.priority) || unique.has(target.skillId)) {
      throw Object.assign(new Error('GVX curriculum target is invalid or duplicated.'), { code: 'GVX_CURRICULUM_TARGET_INVALID' });
    }
    unique.add(target.skillId);
    return { skillId: target.skillId, priority: target.priority };
  });
  return normalized;
}

module.exports = { planCompetenceCurriculum };
