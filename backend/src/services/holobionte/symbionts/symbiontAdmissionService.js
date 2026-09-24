'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const immunePlane = require('../immune/holobiontImmunePlane');

const MINIMUM_TRIAL_CONTRIBUTION = 0.6;

function admissionError(message, code = 'HOLOBIONT_ADMISSION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requireText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw admissionError(`${field} is required.`);
  return text;
}

function requireRevision(value, actual) {
  if (!Number.isInteger(Number(value)) || Number(value) !== actual) {
    throw admissionError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
}

function candidateFor(session, symbiontId, status) {
  const candidate = session.candidateSymbionts.find((item) => item.id === symbiontId);
  if (!candidate || candidate.status !== status) {
    throw admissionError(`Symbiont must be a ${status} candidate.`, 'HOLOBIONT_CANDIDATE_STATE_INVALID');
  }
  return candidate;
}

function selectedDataAccess(input, contract) {
  const requested = input.dataAccess === undefined ? contract.dataAccess : input.dataAccess;
  if (!Array.isArray(requested) || requested.some((item) => !contract.dataAccess.includes(item))) {
    throw admissionError('Trial data access must be a subset of its contract.', 'HOLOBIONT_TRIAL_SCOPE_EXCEEDED');
  }
  return requested;
}

function trialBudget(contract) {
  return Object.fromEntries(Object.entries(contract.maxCost).map(([resource, amount]) => [resource, amount * 0.2]));
}

function trialScope(input, contract) {
  const capability = requireText(input.capability, 'capability');
  if (!contract.capabilitiesOffered.includes(capability)) {
    throw admissionError('Trial capability is outside the SymbiosisContract.', 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE');
  }
  const toolName = input.toolName ? requireText(input.toolName, 'toolName') : null;
  if (toolName && !contract.toolLeases.includes(toolName)) {
    throw admissionError('Trial tool is not leased by the SymbiosisContract.', 'HOLOBIONT_TOOL_LEASE_REQUIRED');
  }
  return {
    capability,
    toolLeases: toolName ? [toolName] : [],
    dataAccess: selectedDataAccess(input, contract),
    maxCost: trialBudget(contract)
  };
}

async function startAdmission(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw admissionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  requireRevision(input.expectedSessionRevision, session.revision);
  const symbiontId = requireText(input.symbiontId, 'symbiontId');
  candidateFor(session, symbiontId, 'CANDIDATE');
  const contract = await contracts.getContract(db, session.holobiontId, symbiontId);
  if (!contract || contract.status !== 'ACTIVE') {
    throw admissionError('An active contract is required before trial.', 'HOLOBIONT_CONTRACT_REQUIRED');
  }
  const sandbox = trialScope(input, contract);
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_ADMISSION_STARTED',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId, contractId: contract.contractId, contractRevision: contract.revision,
      trial: { ...sandbox, trialId: randomUUID(), startedAt: new Date().toISOString() } }
  });
  return { status: 'TRIAL', sessionRevision: revision, sandbox };
}

function trialReceipt(input, candidate) {
  const contribution = Number(input.contributionScore);
  if (!Number.isFinite(contribution) || contribution < 0 || contribution > 1) {
    throw admissionError('contributionScore must be between 0 and 1.');
  }
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) {
    throw admissionError('At least one evidence reference is required.', 'HOLOBIONT_TRIAL_EVIDENCE_REQUIRED');
  }
  const evidenceRefs = input.evidenceRefs.map((item) => requireText(item, 'evidence reference'));
  const receipt = {
    receiptId: randomUUID(), trialId: candidate.admissionTrial.trialId,
    contractId: candidate.contractId, contractRevision: candidate.contractRevision,
    capability: candidate.admissionTrial.capability, contributionScore: contribution,
    contractCompliant: input.contractCompliant === true, evidenceRefs,
    evaluatedAt: new Date().toISOString(), actorId: input.actorId || null
  };
  return { receipt, contribution };
}

function decisionFor(input, contribution, immuneReview) {
  if (input.contractCompliant !== true || input.unsafeBehavior === true || !immuneReview.allowed) return 'QUARANTINED';
  return contribution >= MINIMUM_TRIAL_CONTRIBUTION ? 'ADMITTED' : 'REJECTED';
}

async function reviewTrial(input, receipt) {
  return immunePlane.reviewSymbiontOutput({
    symbiontId: input.symbiontId, resultHash: receipt.trialId,
    evidenceRefs: receipt.evidenceRefs, verifierId: input.verifierId,
    claim: `Trial contribution ${receipt.contributionScore} for ${receipt.capability}`,
    riskScore: input.unsafeBehavior ? 0.95 : input.riskScore,
    selfVerified: input.unsafeBehavior === true || input.selfVerified === true
  });
}

async function evaluateTrial(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw admissionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  requireRevision(input.expectedSessionRevision, session.revision);
  const symbiontId = requireText(input.symbiontId, 'symbiontId');
  const candidate = candidateFor(session, symbiontId, 'TRIAL');
  if (!candidate.admissionTrial) throw admissionError('Trial sandbox record is missing.');
  const { receipt, contribution } = trialReceipt(input, candidate);
  const immuneReview = await reviewTrial(input, receipt);
  receipt.immuneReview = immuneReview;
  const decision = decisionFor(input, contribution, immuneReview);
  const eventType = decision === 'ADMITTED' ? 'SYMBIONT_ADMITTED'
    : decision === 'QUARANTINED' ? 'SYMBIONT_QUARANTINED' : 'SYMBIONT_REJECTED';
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType, expectedRevision: session.revision,
    actorId: input.actorId,
    payload: { symbiontId, receipt, reason: input.reason || null }
  });
  return { decision, receipt, sessionRevision: revision };
}

module.exports = { startAdmission, evaluateTrial, MINIMUM_TRIAL_CONTRIBUTION };
