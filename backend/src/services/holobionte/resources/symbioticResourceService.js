'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');

const BURST_SCORE_THRESHOLD = 0.75;

function resourceError(message, code = 'HOLOBIONT_RESOURCE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function amount(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw resourceError(`${field} must be finite and non-negative.`);
  return number;
}

function requireReason(value) {
  const reason = String(value || '').trim();
  if (!reason) throw resourceError('A revocation reason is required.');
  return reason;
}

function readPolicy(policy, resource) {
  const values = policy[resource];
  if (!values || typeof values !== 'object') throw resourceError(`Missing allocation policy for ${resource}.`);
  const allocation = {
    basal: amount(values.basal, `${resource}.basal`),
    preferred: amount(values.preferred, `${resource}.preferred`),
    maximum: amount(values.maximum, `${resource}.maximum`),
    burstAllowance: amount(values.burstAllowance || 0, `${resource}.burstAllowance`)
  };
  if (allocation.basal > allocation.preferred || allocation.preferred > allocation.maximum) {
    throw resourceError(`${resource} allocations must satisfy basal ≤ preferred ≤ maximum.`);
  }
  return allocation;
}

function verifiedContribution(session, symbiontId) {
  const rows = (session.verifiedContributions || []).filter((item) => item.symbiontId === symbiontId);
  if (!rows.length) return 0;
  const score = amount(rows[rows.length - 1].contributionScore || 0, 'contributionScore');
  if (score > 1) throw resourceError('contributionScore must not exceed 1.');
  return score;
}

function allocateOne(resource, policy, inputs) {
  const ceiling = amount(inputs.contractLimit[resource], `${resource} contract limit`);
  const available = amount(inputs.available[resource] || 0, `${resource} available`);
  const limits = readPolicy(policy, resource);
  if (limits.maximum > ceiling) throw resourceError(`${resource} allocation exceeds the contract.`, 'HOLOBIONT_RESOURCE_CONTRACT_LIMIT');
  if (available < limits.basal) throw resourceError(`${resource} availability is below its basal allocation.`, 'HOLOBIONT_RESOURCE_UNAVAILABLE');
  let granted = Math.min(limits.preferred, available);
  if (inputs.contributionScore >= BURST_SCORE_THRESHOLD) {
    const burst = Math.min(limits.burstAllowance, limits.maximum - granted, available - granted);
    granted += burst;
  }
  return { granted, explanation: { basal: limits.basal, preferred: limits.preferred, burst: granted - Math.min(limits.preferred, available) } };
}

function unreservedResources(available, session) {
  const remaining = {};
  const allocations = Object.values(session.resourceState.allocations || {});
  for (const [key, value] of Object.entries(available)) {
    const reserved = allocations.reduce((sum, item) => sum + amount(item.resources[key] || 0, key), 0);
    remaining[key] = Math.max(0, amount(value, key) - reserved);
  }
  return remaining;
}

function buildAllocations(input, contract, session) {
  if (!input.policy || !input.available || typeof input.policy !== 'object' || typeof input.available !== 'object') {
    throw resourceError('policy and available resource maps are required.');
  }
  const contributionScore = verifiedContribution(session, input.symbiontId);
  const resources = {};
  const explanation = {};
  const available = unreservedResources(input.available, session);
  for (const resource of Object.keys(input.policy)) {
    const result = allocateOne(resource, input.policy, {
      contractLimit: contract.resourcesRequested, available, contributionScore
    });
    resources[resource] = result.granted;
    explanation[resource] = result.explanation;
  }
  if (!Object.keys(resources).length) throw resourceError('At least one resource allocation is required.');
  return { resources, explanation, contributionScore };
}

async function allocationSession(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw resourceError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw resourceError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  return session;
}

async function requiredContext(db, input) {
  const session = await allocationSession(db, input);
  if (session.status !== 'ACTIVE') throw resourceError('Only an active Host can grant resources.', 'HOLOBIONT_SESSION_INACTIVE');
  if (session.resourceState.allocations?.[input.symbiontId]) throw resourceError('Symbiont already has an allocation.', 'HOLOBIONT_RESOURCE_ALREADY_ALLOCATED');
  const resident = session.residentSymbionts.find((item) => item.id === input.symbiontId && item.status === 'RESIDENT');
  if (!resident) throw resourceError('Only an admitted resident can receive resources.', 'HOLOBIONT_SYMBIONT_NOT_RESIDENT');
  const contract = await contracts.getContract(db, input.holobiontId, input.symbiontId);
  if (!contract || contract.status !== 'ACTIVE') throw resourceError('An active contract is required.', 'HOLOBIONT_CONTRACT_REQUIRED');
  return { session, contract };
}

async function grantResources(db, input = {}) {
  const { session, contract } = await requiredContext(db, input);
  const allocation = buildAllocations(input, contract, session);
  const allocationId = randomUUID();
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'RESOURCE_GRANTED',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: {
      symbiontId: input.symbiontId, allocationId, contractId: contract.contractId,
      contractRevision: contract.revision, resources: allocation.resources,
      explanation: allocation.explanation, contributionScore: allocation.contributionScore
    }
  });
  return { allocationId, sessionRevision: revision, ...allocation };
}

async function revokeResources(db, input = {}) {
  const reason = requireReason(input.reason);
  const session = await allocationSession(db, input);
  const current = session.resourceState.allocations?.[input.symbiontId];
  if (!current) throw resourceError('No active resource allocation exists.', 'HOLOBIONT_RESOURCE_ALLOCATION_NOT_FOUND');
  if (input.allocationId && input.allocationId !== current.allocationId) {
    throw resourceError('Allocation was replaced.', 'HOLOBIONT_RESOURCE_ALLOCATION_CONFLICT');
  }
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'RESOURCE_REVOKED',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId: input.symbiontId, allocationId: current.allocationId, reason }
  });
  return { revoked: true, sessionRevision: revision };
}

module.exports = { grantResources, revokeResources, BURST_SCORE_THRESHOLD };
