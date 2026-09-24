'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const admission = require('../symbionts/symbiontAdmissionService');
const immunePlane = require('../immune/holobiontImmunePlane');

const SOURCE_TYPES = Object.freeze([
  'RHIZOME_DISCOVERY', 'PLUGIN_REGISTRY', 'MODEL_REGISTRY',
  'PROCEDURE_ARCHIVE', 'ANOTHER_HOST', 'EXTERNAL_TOOL'
]);

function acquisitionError(message, code = 'HOLOBIONT_ACQUISITION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw acquisitionError(`${field} is required.`);
  return text;
}

function validateSource(source) {
  const sourceType = requiredText(source.type, 'source.type').toUpperCase();
  if (!SOURCE_TYPES.includes(sourceType)) throw acquisitionError('Unknown horizontal acquisition source.');
  return {
    type: sourceType,
    reference: requiredText(source.reference, 'source.reference'),
    sourceHostId: source.sourceHostId ? String(source.sourceHostId).trim() : null
  };
}

function candidateProfile(symbiont, source) {
  if (!symbiont || typeof symbiont !== 'object' || Array.isArray(symbiont)) {
    throw acquisitionError('A symbiont definition is required.');
  }
  const id = requiredText(symbiont.id, 'symbiont.id');
  const { admissionReceipt, admissionTrial, status, contractId, contractRevision, ...definition } = symbiont;
  return { id, ...definition, status: 'CANDIDATE', acquisition: { mode: 'HORIZONTAL', ...source } };
}

function ensureHostAllows(session) {
  if (!session.constitution) throw acquisitionError('A Host constitution is required.', 'HOLOBIONT_CONSTITUTION_REQUIRED');
  const policy = String(session.constitution.transmissionPolicy || 'NEVER_INHERIT').toUpperCase();
  if (policy === 'VERTICAL_REQUIRED') {
    throw acquisitionError('Host policy requires vertical transmission.', 'HOLOBIONT_TRANSMISSION_CONFLICT');
  }
}

function ensureNewCandidate(session, symbiontId) {
  const known = [...session.candidateSymbionts, ...session.residentSymbionts].some((item) => item.id === symbiontId);
  if (known) throw acquisitionError('Symbiont is already known by this Host.', 'HOLOBIONT_SYMBIONT_ALREADY_KNOWN');
}

function validateContractInput(contractInput, session, symbiontId) {
  const contract = contracts.validateContract(contractInput, session.constitution);
  if (contract.symbiontId !== symbiontId) throw acquisitionError('Contract symbiontId must match the acquired candidate.');
  return contract;
}

function trialRequest(input, session, contract) {
  const capability = requiredText(input.capability, 'capability');
  if (!contract.capabilitiesOffered.includes(capability)) {
    throw acquisitionError('Trial capability is outside the SymbiosisContract.', 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE');
  }
  if (input.toolName && !contract.toolLeases.includes(input.toolName)) {
    throw acquisitionError('Trial tool is not leased by the SymbiosisContract.', 'HOLOBIONT_TOOL_LEASE_REQUIRED');
  }
  const dataAccess = input.dataAccess === undefined ? contract.dataAccess : input.dataAccess;
  if (!Array.isArray(dataAccess) || dataAccess.some((item) => !contract.dataAccess.includes(item))) {
    throw acquisitionError('Trial data access must be a subset of its contract.', 'HOLOBIONT_TRIAL_SCOPE_EXCEEDED');
  }
  return { holobiontId: session.holobiontId, symbiontId: contract.symbiontId, capability,
    toolName: input.toolName, dataAccess };
}

async function discoverAndQuarantine(context) {
  const { db, input, session, candidate } = context;
  let revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId: candidate.id, symbiont: candidate }
  });
  revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_QUARANTINED',
    expectedRevision: revision, actorId: input.actorId,
    payload: { symbiontId: candidate.id, reason: 'HORIZONTAL_SOURCE_REVIEW' }
  });
  return revision;
}

async function reviewSource(context) {
  const { input, candidate, contract, source } = context;
  return immunePlane.reviewSymbiontOutput({
    symbiontId: candidate.id,
    claim: `Horizontal acquisition from ${source.type}: ${JSON.stringify(candidate)}`,
    resultHash: contract.contractId,
    evidenceRefs: input.evidenceRefs,
    verifierId: input.verifierId,
    riskScore: input.riskScore,
    selfVerified: input.selfVerified === true
  });
}

async function releaseCandidate(context) {
  const { db, input, session, candidate, review, source } = context;
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'HORIZONTAL_ACQUISITION',
    expectedRevision: session.revision + 2, actorId: input.actorId,
    payload: { symbiontId: candidate.id, source, immuneReview: review,
      releaseReceipt: { receiptId: randomUUID(), immuneReview: review }, status: 'CANDIDATE' }
  });
  return revision;
}

async function acquireHorizontally(db, input = {}) {
  const session = await store.getSession(db, requiredText(input.holobiontId, 'holobiontId'));
  if (!session) throw acquisitionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) throw acquisitionError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  ensureHostAllows(session);
  const source = validateSource(input.source || {});
  const candidate = candidateProfile(input.symbiont, source);
  ensureNewCandidate(session, candidate.id);
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) {
    throw acquisitionError('Source evidence is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  }
  const contract = validateContractInput(input.contract || {}, session, candidate.id);
  const trial = trialRequest(input, session, contract);
  const context = { db, input, session, candidate, contract, source };
  const quarantinedRevision = await discoverAndQuarantine(context);
  const review = await reviewSource(context);
  if (!review.allowed) {
    await store.appendEvent(db, {
      holobiontId: session.holobiontId, eventType: 'IMMUNE_REJECTION',
      expectedRevision: quarantinedRevision, actorId: input.actorId,
      payload: { symbiontId: candidate.id, source, immuneReview: review }
    });
    return { status: 'QUARANTINED', symbiontId: candidate.id, source, immuneReview: review };
  }
  await contracts.createContract(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: quarantinedRevision,
    actorId: input.actorId, contract: input.contract
  });
  await releaseCandidate({ ...context, review });
  const current = await store.getSession(db, session.holobiontId);
  const trialResult = await admission.startAdmission(db, {
    ...trial, holobiontId: session.holobiontId, expectedSessionRevision: current.revision,
    actorId: input.actorId
  });
  return { status: 'TRIAL', symbiontId: candidate.id, source, immuneReview: review, trial: trialResult };
}

module.exports = { acquireHorizontally, SOURCE_TYPES };
