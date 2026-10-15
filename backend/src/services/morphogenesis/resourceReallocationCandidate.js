'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function allocationAdmissible(plan) {
  return validPlanShape(plan) && validBudgetAccounting(plan)
    && validFundedAllocations(plan) && validActionList(plan);
}

function validPlanShape(plan) {
  return plan?.schemaVersion === 1 && Array.isArray(plan.allocations)
    && Array.isArray(plan.actions) && Array.isArray(plan.groupStates);
}

function validBudgetAccounting(plan) {
  const values = [plan.budget, plan.allocatedTokens, plan.unallocatedTokens];
  return values.every(Number.isSafeInteger) && values.every((value) => value >= 0)
    && plan.allocatedTokens + plan.unallocatedTokens === plan.budget;
}

function validFundedAllocations(plan) {
  const funded = plan.allocations.filter((item) => item.allocatedTokens > 0);
  return funded.length > 0 && funded.every(fundedAllocationAdmissible)
    && fundedTotal(funded) === plan.allocatedTokens;
}

function fundedAllocationAdmissible(item) {
  return Boolean(item.groupId && item.bidId && Number.isSafeInteger(item.allocatedTokens)
    && Array.isArray(item.evidenceRefs) && item.evidenceRefs.length
    && ['funded', 'partial'].includes(item.status) && proofsAdmissible(item));
}

function fundedTotal(funded) {
  return funded.reduce((sum, item) => sum + item.allocatedTokens, 0);
}

function validActionList(plan) {
  return plan.actions.length === 0;
}

function proofsAdmissible(allocation) {
  return typeof allocation.proofDigest === 'string'
    && /^sha256:[a-f0-9]{64}$/i.test(allocation.proofDigest)
    && Array.isArray(allocation.proofReceipts) && allocation.proofReceipts.length > 0
    && allocation.proofReceipts.every((receipt) => evidenceAudit.isVerifiedReceipt(receipt)
      && receipt.evidenceDigest === allocation.proofDigest
      && allocation.evidenceRefs.includes(receipt.resultId));
}

function allocationPayload(item) {
  return { groupId: item.groupId, bidId: item.bidId, requestedTokens: item.requestedTokens,
    minimumTokens: item.minimumTokens, allocatedTokens: item.allocatedTokens,
    marginalValue: item.marginalValue, evidenceRefs: [...item.evidenceRefs].map(String).sort(),
    workerKind: item.workerKind, workerCount: item.workerCount, governance: item.governance,
    status: item.status, proofDigest: item.proofDigest,
    proofReceiptIds: item.proofReceipts.map((receipt) => receipt.resultId).sort() };
}

function candidatePayload(plan) {
  const allocations = plan.allocations.map(allocationPayload)
    .sort((left, right) => left.groupId.localeCompare(right.groupId) || left.bidId.localeCompare(right.bidId));
  return canonical({ schemaVersion: plan.schemaVersion, budget: plan.budget,
    allocatedTokens: plan.allocatedTokens, unallocatedTokens: plan.unallocatedTokens, allocations,
    actions: plan.actions,
    groupStates: plan.groupStates.map((group) => ({ groupId: group.groupId, state: group.state, reason: group.reason }))
      .sort((left, right) => left.groupId.localeCompare(right.groupId)) });
}

function describeResourceReallocation(plan) {
  if (!allocationAdmissible(plan)) return { status: 'unavailable', reason: 'allocation_or_proof_not_admissible' };
  const body = JSON.stringify(candidatePayload(plan));
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  return { status: 'available', candidateId: `resource-reallocation:sha256:${digest}`,
    planDigest: `sha256:${digest}`, scale: 'RESOURCE_REALLOCATION' };
}

module.exports = { allocationAdmissible, describeResourceReallocation };
