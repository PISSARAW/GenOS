'use strict';

const { createHash } = require('crypto');
const { withTransaction } = require('../../../db');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const immunePlane = require('../immune/holobiontImmunePlane');

function recoveryError(message, code = 'HOLOBIONT_RECOVERY_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw recoveryError(`${field} is required.`);
  return normalized;
}

function offeredCapabilities(contract) {
  return contract?.capabilitiesOffered || [];
}

function candidateStatus(session, symbiontId) {
  const resident = session.residentSymbionts.find((item) => item.id === symbiontId);
  if (resident) return resident.status;
  const candidate = session.candidateSymbionts.find((item) => item.id === symbiontId);
  return candidate?.status || null;
}

function compatibility(sourceCapabilities, targetCapabilities) {
  if (sourceCapabilities.length === 0) return false;
  for (const capability of sourceCapabilities) {
    if (!targetCapabilities.includes(capability)) return false;
  }
  return true;
}

function readiness(status, contract, sameNiche) {
  if (status === 'RESIDENT' && contract?.status === 'ACTIVE' && sameNiche) return 'READY';
  if (status === 'CANDIDATE' && contract?.status === 'ACTIVE' && sameNiche) return 'NEEDS_ADMISSION';
  return 'INELIGIBLE';
}

function ineligibilityReason(contract, sameNiche) {
  if (!contract || contract.status !== 'ACTIVE') return 'ACTIVE_CONTRACT_REQUIRED';
  return sameNiche ? null : 'FUNCTIONAL_NICHE_MISMATCH';
}

async function replacementOption(db, context) {
  const { session, sourceCapabilities, symbiont } = context;
  const contract = await contracts.getContract(db, session.holobiontId, symbiont.id);
  const capabilities = offeredCapabilities(contract);
  const sameNiche = compatibility(sourceCapabilities, capabilities);
  const status = candidateStatus(session, symbiont.id);
  return {
    symbiontId: symbiont.id, status, readiness: readiness(status, contract, sameNiche),
    capabilities, contractId: contract?.contractId || null,
    reason: ineligibilityReason(contract, sameNiche)
  };
}

async function planReplacement(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw recoveryError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  const sourceId = text(input.symbiontId, 'symbiontId');
  const source = session.residentSymbionts.find((item) => item.id === sourceId);
  if (!source) throw recoveryError('Replacement source must be a resident.', 'HOLOBIONT_SYMBIONT_NOT_RESIDENT');
  const sourceContract = await contracts.getContract(db, session.holobiontId, sourceId);
  if (!sourceContract) throw recoveryError('Source SymbiosisContract not found.', 'HOLOBIONT_CONTRACT_NOT_FOUND');
  const alternatives = [...session.residentSymbionts, ...session.candidateSymbionts]
    .filter((item) => item.id !== sourceId);
  const options = await Promise.all(alternatives.map((symbiont) => replacementOption(db, {
    session, sourceCapabilities: sourceContract.capabilitiesOffered, symbiont
  })));
  options.sort((left, right) => readinessRank(left) - readinessRank(right)
    || left.symbiontId.localeCompare(right.symbiontId));
  return {
    sourceSymbiontId: sourceId, sourceStatus: source.status,
    previousReplacementSymbiontId: source.replacementSymbiontId || null,
    capabilities: sourceContract.capabilitiesOffered,
    options, hasReadyBackup: options.some((item) => item.readiness === 'READY'),
    recoveryStatus: options.some((item) => item.readiness === 'READY') ? 'BACKUP_READY'
      : options.some((item) => item.readiness === 'NEEDS_ADMISSION') ? 'ADMISSION_REQUIRED' : 'NO_SUBSTITUTE'
  };
}

function readinessRank(option) {
  return option.readiness === 'READY' ? 0 : option.readiness === 'NEEDS_ADMISSION' ? 1 : 2;
}

async function replaceWithResidentBackup(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw recoveryError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw recoveryError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const replacementId = text(input.replacementSymbiontId, 'replacementSymbiontId');
  const plan = await planReplacement(db, input);
  const option = plan.options.find((item) => item.symbiontId === replacementId);
  if (!option || option.readiness !== 'READY') {
    throw recoveryError('Replacement must be a compatible resident with an active contract.', 'HOLOBIONT_SUBSTITUTE_NOT_READY');
  }
  if (plan.sourceStatus === 'DORMANT' && plan.previousReplacementSymbiontId === replacementId) {
    return { replaced: true, idempotent: true, sourceSymbiontId: plan.sourceSymbiontId,
      replacementSymbiontId: replacementId, sessionRevision: session.revision };
  }
  if (plan.sourceStatus === 'DORMANT') throw recoveryError('A dormant source cannot be replaced again.', 'HOLOBIONT_SOURCE_ALREADY_DORMANT');
  text(input.reason, 'reason');
  return applyReplacement(db, { input, session, replacementId, option, plan });
}

async function applyReplacement(db, context) {
  const { input, session, replacementId, option, plan } = context;
  const resultHash = `sha256:${createHash('sha256').update(JSON.stringify({
    source: plan.sourceSymbiontId, replacement: replacementId, capabilities: plan.capabilities
  })).digest('hex')}`;
  const immuneReview = await immunePlane.reviewSymbiontOutput({
    symbiontId: session.hostId, claim: `Replace ${plan.sourceSymbiontId} with ${replacementId}`,
    resultHash, verifierId: input.actorId, riskScore: 0.1,
    evidenceRefs: [`contract:${option.contractId}`, `contract:${plan.sourceSymbiontId}`]
  });
  if (!immuneReview.allowed) return recordRejectedRecovery(db, { input, session, immuneReview });
  return persistReplacement(db, { input, session, plan, replacementId, immuneReview });
}

async function recordRejectedRecovery(db, context) {
  const { input, session, immuneReview } = context;
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'IMMUNE_REJECTION',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId: input.symbiontId, replacementSymbiontId: input.replacementSymbiontId, immuneReview }
  });
  return { replaced: false, reason: 'AEIS_IMMUNE_REJECTION', immuneReview, sessionRevision: revision };
}

async function persistReplacement(db, context) {
  const { input, session, plan, replacementId, immuneReview } = context;
  const allocation = session.resourceState.allocations?.[plan.sourceSymbiontId];
  let revision = session.revision;
  await withTransaction(db, async (tx) => {
    if (allocation) revision = await store.appendEvent(tx, {
      holobiontId: session.holobiontId, eventType: 'RESOURCE_REVOKED',
      expectedRevision: revision, actorId: input.actorId,
      payload: { symbiontId: plan.sourceSymbiontId, allocationId: allocation.allocationId,
        reason: `replaced-by:${replacementId}` }
    });
    revision = await store.appendEvent(tx, {
      holobiontId: session.holobiontId, eventType: 'SYMBIONT_DORMANT',
      expectedRevision: revision, actorId: input.actorId,
      payload: { symbiontId: plan.sourceSymbiontId, replacementSymbiontId: replacementId,
        reason: text(input.reason, 'reason'), immuneReview }
    });
  });
  return { replaced: true, sourceSymbiontId: plan.sourceSymbiontId,
    replacementSymbiontId: replacementId, sessionRevision: revision };
}

module.exports = { planReplacement, replaceWithResidentBackup };
