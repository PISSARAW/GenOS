'use strict';

const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const memory = require('../memory/symbioticMemoryService');
const immunePlane = require('../immune/holobiontImmunePlane');
const { authorizeHostDecision } = require('../host/hostConstitutionService');

const ACTIONS = Object.freeze([
  'WARN', 'THROTTLE', 'REDUCE_CONTEXT', 'REDUCE_RESOURCES', 'REVOKE_TOOL',
  'REVOKE_NETWORK', 'RESTRICT_SCOPE', 'QUARANTINE', 'DORMANT', 'EXPEL'
]);
const CONTRACT_ACTIONS = new Set(ACTIONS.slice(1, 7));

function sanctionError(message, code = 'HOLOBIONT_SANCTION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, field) {
  const result = String(value || '').trim();
  if (!result) throw sanctionError(`${field} is required.`);
  return result;
}

function ensureKnownTarget(session, symbiontId) {
  const known = [...session.residentSymbionts, ...session.candidateSymbionts].some((item) => item.id === symbiontId);
  if (!known) throw sanctionError('Sanction target is unknown to this Host.', 'HOLOBIONT_SYMBIONT_UNKNOWN');
}

function ensureApproval(action, input) {
  if (action === 'EXPEL' && !['SYSTEM', 'USER'].includes(String(input.approvedBy || '').toUpperCase())) {
    throw sanctionError('Expulsion requires explicit system or user approval.', 'HOLOBIONT_EXPULSION_APPROVAL_REQUIRED');
  }
}

function sanctionEvidence(input) {
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map((item) => requiredText(item, 'evidence reference')) : [];
  const recoveryConditions = Array.isArray(input.recoveryConditions) ? input.recoveryConditions.map((item) => requiredText(item, 'recovery condition')) : [];
  if (!evidenceRefs.length || !recoveryConditions.length) throw sanctionError('Sanctions require evidence and recovery conditions.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  if (!String(input.duration || '').trim()) throw sanctionError('Sanction duration is required.');
  return { evidenceRefs, recoveryConditions };
}

function validateSanction(session, input) {
  const symbiontId = requiredText(input.symbiontId, 'symbiontId');
  ensureKnownTarget(session, symbiontId);
  const action = requiredText(input.action, 'action').toUpperCase();
  if (!ACTIONS.includes(action)) throw sanctionError('Unknown sanction action.');
  ensureApproval(action, input);
  if (Number(input.expectedSessionRevision) !== session.revision) throw sanctionError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  const { evidenceRefs, recoveryConditions } = sanctionEvidence(input);
  authorizeHostDecision({ constitution: session.constitution, requestedAuthority: 'HOST', changedInvariants: input.changedInvariants || [] });
  return { symbiontId, action, evidenceRefs, recoveryConditions };
}

function ratio(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1) throw sanctionError('Sanction ratio must be greater than 0 and less than 1.');
  return amount;
}

function scaleEntry(entry, factor) {
  const [key, value] = entry;
  return [key, Number(value) * factor];
}

function scaled(values, factor) {
  return Object.fromEntries(Object.entries(values).map((entry) => scaleEntry(entry, factor)));
}

function scaledContract(contract, input) {
  const factor = ratio(input.ratio);
  return { maxCost: scaled(contract.maxCost, factor), resourcesRequested: scaled(contract.resourcesRequested, factor) };
}

function reducedContext(input) {
  if (!Array.isArray(input.allowedDataAccess)) throw sanctionError('allowedDataAccess must be a list.');
  return { dataAccess: input.allowedDataAccess };
}

function revokedTool(contract, input) {
  const toolName = requiredText(input.toolName, 'toolName');
  if (!contract.toolLeases.includes(toolName)) throw sanctionError('Tool is not leased by the contract.', 'HOLOBIONT_TOOL_LEASE_REQUIRED');
  return { toolLeases: contract.toolLeases.filter((item) => item !== toolName) };
}

function revokedNetwork(contract, input) {
  const networkTools = Array.isArray(input.networkTools) ? input.networkTools : [];
  if (!networkTools.length || networkTools.some((item) => !contract.toolLeases.includes(item))) {
    throw sanctionError('Network revocation must list currently leased tools.');
  }
  return { toolLeases: contract.toolLeases.filter((item) => !networkTools.includes(item)) };
}

function restrictedScope(contract, input) {
  return { capabilitiesOffered: input.allowedCapabilities, authorityScope: {
    ...contract.authorityScope, actions: input.allowedActions
  } };
}

function contractChanges(action, contract, input) {
  const handlers = {
    THROTTLE: scaledContract, REDUCE_RESOURCES: scaledContract,
    REDUCE_CONTEXT: (_contract, value) => reducedContext(value),
    REVOKE_TOOL: revokedTool, REVOKE_NETWORK: revokedNetwork,
    RESTRICT_SCOPE: restrictedScope
  };
  return handlers[action](contract, input);
}

async function adaptContract(context) {
  const { db, input, target, action } = context;
  const { holobiontId } = input;
  const contract = await contracts.getContract(db, holobiontId, target.symbiontId);
  if (!contract || contract.status !== 'ACTIVE') throw sanctionError('An active contract is required to narrow permissions.', 'HOLOBIONT_CONTRACT_REQUIRED');
  const changes = contractChanges(action, contract, input);
  if (action === 'REDUCE_CONTEXT' && changes.dataAccess.some((item) => !contract.dataAccess.includes(item))) {
    throw sanctionError('Reduced context must remain within current data access.', 'HOLOBIONT_ADAPTATION_ESCALATION');
  }
  return contracts.adaptContract(db, {
    holobiontId, symbiontId: target.symbiontId,
    expectedSessionRevision: target.session.revision, expectedContractRevision: contract.revision,
    changes, evidenceRefs: target.evidenceRefs, verifierId: input.verifierId,
    actorId: input.actorId, riskScore: input.riskScore, selfVerified: input.selfVerified
  });
}

async function revokeResources(context) {
  const { db, input, session, symbiontId } = context;
  if (!session.resourceState.allocations?.[symbiontId]) return session;
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'RESOURCE_REVOKED',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId, reason: `SANCTION:${input.action}` }
  });
  return store.getSession(db, session.holobiontId);
}

async function applyLifecycleSanction(db, input, target) {
  let session = target.session;
  if (input.action === 'DORMANT' || input.action === 'EXPEL') {
    session = await revokeResources({ db, input, session, symbiontId: target.symbiontId });
  }
  if (input.action === 'EXPEL') {
    const contract = await contracts.getContract(db, input.holobiontId, target.symbiontId);
    if (contract?.status === 'ACTIVE') await contracts.revokeContract(db, {
      holobiontId: input.holobiontId, symbiontId: target.symbiontId,
      expectedContractRevision: contract.revision, expectedSessionRevision: session.revision,
      reason: input.reason, actorId: input.actorId
    });
  }
  const eventType = input.action === 'QUARANTINE' ? 'SYMBIONT_QUARANTINED'
    : input.action === 'DORMANT' ? 'SYMBIONT_DORMANT' : 'SYMBIONT_EXPELLED';
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType, expectedRevision: session.revision,
    actorId: input.actorId, payload: { symbiontId: target.symbiontId, reason: input.reason }
  });
  return { eventType, sessionRevision: revision };
}

async function applySanction(db, input, target) {
  if (CONTRACT_ACTIONS.has(input.action)) return adaptContract({ db, input, target, action: input.action });
  if (input.action === 'WARN') return { action: 'WARN', recorded: true };
  return applyLifecycleSanction(db, input, target);
}

async function sanctionSymbiont(db, input = {}) {
  input = { ...input, action: String(input.action || '').trim().toUpperCase() };
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw sanctionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  const target = { session, ...validateSanction(session, input) };
  const review = await immunePlane.reviewSymbiontOutput({
    symbiontId: target.symbiontId, claim: `Apply ${target.action} sanction: ${requiredText(input.reason, 'reason')}`,
    resultHash: `${session.holobiontId}:${target.symbiontId}:${session.revision}`,
    evidenceRefs: target.evidenceRefs, verifierId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  if (!review.allowed) return { applied: false, reason: 'AEIS_REJECTION', immuneReview: review };
  const record = await memory.recordMemory(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    memoryType: 'PARTNER_REPUTATION', scope: session.scope,
    content: { type: 'SYMBIONT_SANCTION', sanctionId: `${session.holobiontId}:${target.symbiontId}:${session.revision}`,
      symbiontId: target.symbiontId, action: target.action, reason: input.reason,
      duration: input.duration, recoveryConditions: target.recoveryConditions,
      approvedBy: input.approvedBy || null, immuneReview: review },
    evidenceRefs: target.evidenceRefs, dataClasses: input.dataClasses || [],
    authorId: input.verifierId, riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  if (record.accepted === false) return { applied: false, reason: record.reason, immuneReview: record.immuneReview };
  const result = await applySanction(db, input, target);
  return { applied: true, action: target.action, sanctionMemoryId: record.memoryId, immuneReview: review, result };
}

module.exports = { sanctionSymbiont, ACTIONS };
