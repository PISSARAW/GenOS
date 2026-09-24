'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const immunePlane = require('../immune/holobiontImmunePlane');

const PHASE_CAPABILITIES = Object.freeze({
  PLANNING: ['research', 'architecture'],
  IMPLEMENTATION: ['code', 'database', 'testing'],
  VERIFICATION: ['security', 'testing'],
  RELEASE: ['security', 'deployment'],
  MAINTENANCE: ['daemons', 'memory']
});

function successionError(message, code = 'HOLOBIONT_SUCCESSION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function normalizedPhase(value) {
  const phase = String(value || '').trim().toUpperCase();
  if (!PHASE_CAPABILITIES[phase]) throw successionError('Unknown mission succession phase.');
  return phase;
}

function requiredCapabilities(input, phase) {
  const requested = input.requiredCapabilities === undefined ? PHASE_CAPABILITIES[phase] : input.requiredCapabilities;
  if (!Array.isArray(requested) || requested.length === 0) throw successionError('Phase capabilities must be a non-empty array.');
  return [...new Set(requested.map((item) => String(item || '').trim()).filter(Boolean))];
}

async function contractMap(db, session) {
  const residents = [...session.residentSymbionts, ...session.candidateSymbionts];
  const contractsBySymbiont = await Promise.all(residents.map(async (symbiont) => [
    symbiont.id, await contracts.getContract(db, session.holobiontId, symbiont.id)
  ]));
  return new Map(contractsBySymbiont);
}

function overlaps(capabilities, required) {
  return capabilities.some((capability) => required.includes(capability));
}

function summarize(context) {
  const { session, phase, required, byId } = context;
  const active = session.residentSymbionts.filter((item) => item.status === 'RESIDENT');
  const retiring = active.filter((item) => !overlaps(byId.get(item.id)?.capabilitiesOffered || [], required));
  const retained = active.filter((item) => !retiring.includes(item));
  const supplied = new Set(retained.flatMap((item) => byId.get(item.id)?.capabilitiesOffered || []));
  const missing = required.filter((capability) => !supplied.has(capability));
  const resumable = session.residentSymbionts.filter((item) => item.status === 'DORMANT'
    && overlaps(byId.get(item.id)?.capabilitiesOffered || [], missing));
  const awaitingAdmission = session.candidateSymbionts.filter((item) => item.status === 'CANDIDATE'
    && overlaps(byId.get(item.id)?.capabilitiesOffered || [], missing));
  return {
    phase, requiredCapabilities: required,
    retainedSymbiontIds: retained.map((item) => item.id),
    dormantSymbiontIds: retiring.map((item) => item.id),
    resumableSymbiontIds: resumable.map((item) => item.id),
    awaitingAdmissionSymbiontIds: awaitingAdmission.map((item) => item.id),
    missingCapabilities: missing
  };
}

async function planSuccession(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw successionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) throw successionError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  const phase = normalizedPhase(input.phase);
  const required = requiredCapabilities(input, phase);
  const byId = await contractMap(db, session);
  return summarize({ session, phase, required, byId });
}

async function applySuccession(db, input = {}) {
  const plan = await planSuccession(db, input);
  let session = await store.getSession(db, input.holobiontId);
  for (const symbiontId of plan.dormantSymbiontIds) {
    if (session.resourceState.allocations?.[symbiontId]) {
      await store.appendEvent(db, {
        holobiontId: session.holobiontId, eventType: 'RESOURCE_REVOKED',
        expectedRevision: session.revision, actorId: input.actorId,
        payload: { symbiontId, reason: `SUCCESSION:${plan.phase}` }
      });
      session = await store.getSession(db, session.holobiontId);
    }
    await store.appendEvent(db, {
      holobiontId: session.holobiontId, eventType: 'SYMBIONT_DORMANT',
      expectedRevision: session.revision, actorId: input.actorId,
      payload: { symbiontId, reason: `SUCCESSION:${plan.phase}` }
    });
    session = await store.getSession(db, session.holobiontId);
  }
  return { ...plan, session };
}

async function resumeContext(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw successionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) throw successionError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  const symbiontId = String(input.symbiontId || '').trim();
  const symbiont = session.residentSymbionts.find((item) => item.id === symbiontId);
  if (!symbiont || symbiont.status !== 'DORMANT') throw successionError('Symbiont must be dormant to resume.');
  const contract = await contracts.getContract(db, session.holobiontId, symbiontId);
  if (!contract || contract.status !== 'ACTIVE') throw successionError('An active SymbiosisContract is required.', 'HOLOBIONT_CONTRACT_REQUIRED');
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) throw successionError('Resumption evidence is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  return { session, contract, symbiontId };
}

async function rejectResumption(context) {
  const { db, input, session, symbiontId, review } = context;
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'IMMUNE_REJECTION',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId, immuneReview: review, action: 'RESUMPTION' }
  });
  return { resumed: false, status: 'DORMANT', immuneReview: review };
}

async function resumeDormantSymbiont(db, input = {}) {
  const context = await resumeContext(db, input);
  const { session, contract, symbiontId } = context;
  const review = await immunePlane.reviewSymbiontOutput({
    symbiontId, claim: `Resume dormant symbiont under contract ${contract.contractId}`,
    resultHash: `${session.holobiontId}:${symbiontId}:${session.revision}`,
    evidenceRefs: input.evidenceRefs, verifierId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  if (!review.allowed) return rejectResumption({ db, input, session, symbiontId, review });
  const receipt = { receiptId: randomUUID(), contractId: contract.contractId,
    contractRevision: contract.revision, evidenceRefs: input.evidenceRefs, immuneReview: review };
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, eventType: 'SYMBIONT_ADMITTED',
    expectedRevision: session.revision, actorId: input.actorId,
    payload: { symbiontId, receipt }
  });
  return { resumed: true, status: 'RESIDENT', receipt, sessionRevision: revision };
}

module.exports = { planSuccession, applySuccession, resumeDormantSymbiont, PHASE_CAPABILITIES };
