'use strict';

const persistence = require('../agowStatePersistenceService');
const policyService = require('../agowMechanismPolicyService');
const eligibility = require('./pathwayEligibilityService');

const SCOPE = 'agow_pathway_plasticity';
const LEARNING_MODES = new Set(['shadow', 'advisory', 'bounded', 'live']);

function validInput(input) {
  return Boolean(input?.agentId && input.pathwayId && typeof input.success === 'boolean'
    && Number.isFinite(Number(input.predictionError)) && Array.isArray(input.evidenceRefs));
}

async function recordOutcome(input) {
  if (!validInput(input)) throw new TypeError('A verified AGOW pathway outcome requires identity, prediction error and evidence references.');
  const policy = await policyService.load({ agentId: input.agentId, db: input.db });
  if (policy.plasticity === 'disabled') return { recorded: false, reason: 'plasticity_disabled' };
  return persistOutcome(input, policy);
}

async function persistOutcome(input, policy) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: input.agentId, db: input.db });
  const pathways = { ...(loaded.state.pathways || {}) };
  const key = `${input.pathwayId}:${input.contextHash || 'global'}`;
  const updated = eligibility.updatePathway(pathways[key], { ...input, contextHash: input.contextHash || 'global' });
  const pathway = LEARNING_MODES.has(policy.plasticity) ? updated : preserveWeights(updated, pathways[key]);
  pathways[key] = pathway;
  await persistence.save({ scope: SCOPE, agentId: input.agentId, db: loaded.db,
    state: { pathways }, version: Date.now() });
  return { recorded: true, pathway, proposed: policy.plasticity === 'observe' ? updated : null,
    mode: policy.plasticity };
}

function preserveWeights(proposal, previous) {
  return { ...proposal, fastWeight: previous?.fastWeight ?? 0.5,
    eligibilityTrace: previous?.eligibilityTrace ?? 0, supportCount: previous?.supportCount ?? 0,
    failureCount: previous?.failureCount ?? 0, status: previous?.status || 'novel' };
}

async function consolidatePathway(options) {
  const policy = await policyService.load({ agentId: options.agentId, db: options.db });
  if (!['bounded', 'live'].includes(policy.plasticity)) {
    return { consolidated: false, reason: 'consolidation_policy_requires_bounded_mode' };
  }
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const pathways = { ...(loaded.state.pathways || {}) };
  const pathway = pathways[options.key];
  const result = eligibility.consolidate(pathway, options);
  if (!result.consolidated) return result;
  pathways[options.key] = result.pathway;
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db,
    state: { pathways }, version: Date.now() });
  return result;
}

async function listPathways(options) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return Object.values(loaded.state.pathways || {});
}

module.exports = { recordOutcome, consolidatePathway, listPathways, SCOPE };
