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
  const trusted = trustedOutcome(input);
  if (!validInput(trusted)) throw new TypeError('An AGOW pathway outcome requires identity, prediction error and evidence references.');
  const policy = await policyService.load({ agentId: trusted.agentId, db: trusted.db });
  if (policy.plasticity === 'disabled') return { recorded: false, reason: 'plasticity_disabled' };
  return persistOutcome(trusted, policy);
}

function trustedOutcome(input) {
  if (!input?.signedReceipt) return { ...input, evidenceStatus: 'reported' };
  const receipt = require('../../developmentalBridge/developmentReceiptVerifier').verifyDevelopmentReceipt(input);
  return { ...input, receiptId: receipt.receiptId, evidenceStatus: 'verified',
    evidenceRefs: [receipt.receiptId, ...receipt.evidenceRefs.map((item) => item.artifactHash)] };
}

async function persistOutcome(input, policy) {
  const key = `${input.pathwayId}:${input.contextHash || 'global'}`;
  let proposed;
  const state = await persistence.update({ scope: SCOPE, agentId: input.agentId, db: input.db }, (current) => {
    const pathways = { ...(current.pathways || {}) };
    proposed = eligibility.updatePathway(pathways[key], { ...input, contextHash: input.contextHash || 'global' });
    pathways[key] = LEARNING_MODES.has(policy.plasticity) ? proposed : preserveWeights(proposed, pathways[key]);
    return { ...current, pathways };
  });
  return { recorded: true, pathway: state.pathways[key], proposed: policy.plasticity === 'observe' ? proposed : null,
    mode: policy.plasticity };
}

function preserveWeights(proposal, previous) {
  return { ...proposal, fastWeight: previous?.fastWeight ?? 0.5,
    eligibilityTrace: previous?.eligibilityTrace ?? 0, supportCount: previous?.supportCount ?? 0,
    failureCount: previous?.failureCount ?? 0, status: previous?.status || 'novel' };
}

async function consolidatePathway(options) {
  let receipt;
  try { receipt = require('../../developmentalBridge/developmentReceiptVerifier').verifyDevelopmentReceipt(options); }
  catch (_) { return { consolidated: false, reason: 'independent_receipt_required' }; }
  if (!receipt.success) return { consolidated: false, reason: 'successful_receipt_required' };
  const policy = await policyService.load({ agentId: options.agentId, db: options.db });
  if (!['bounded', 'live'].includes(policy.plasticity)) {
    return { consolidated: false, reason: 'consolidation_policy_requires_bounded_mode' };
  }
  let result;
  await persistence.update({ scope: SCOPE, agentId: options.agentId, db: options.db }, (current) => {
    const pathways = { ...(current.pathways || {}) };
    result = eligibility.consolidate(pathways[options.key], { evidenceStatus: 'verified' });
    if (result.consolidated) pathways[options.key] = result.pathway;
    return { ...current, pathways };
  });
  return result;
}

async function listPathways(options) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return Object.values(loaded.state.pathways || {});
}

module.exports = { recordOutcome, consolidatePathway, listPathways, SCOPE };
