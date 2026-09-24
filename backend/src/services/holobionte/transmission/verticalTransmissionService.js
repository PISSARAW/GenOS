'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const constitutionService = require('../host/hostConstitutionService');
const { decideInheritance } = require('./inheritancePolicyService');
const { validateInheritedSymbiont } = require('./inheritedSymbiontValidator');

function transmissionError(message, code = 'HOLOBIONT_TRANSMISSION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, field) {
  const result = String(value || '').trim();
  if (!result) throw transmissionError(`${field} is required.`);
  return result;
}

function parentRequirements(parent) {
  if (parent.scope !== 'PERSISTENT' || !parent.constitution) {
    throw transmissionError('Vertical transmission requires a persistent Host with a constitution.', 'HOLOBIONT_PERSISTENT_HOST_REQUIRED');
  }
}

function childConstitution(parent, childHostId) {
  return constitutionService.createHostConstitution({
    ...parent.constitution,
    constitutionId: randomUUID(), hostId: childHostId, revision: 1,
    lastAmendment: null
  });
}

function inheritedCandidate(source) {
  const { admissionReceipt, status, ...definition } = source;
  return { ...definition, status: 'CANDIDATE', inherited: true };
}

async function createChild(db, input, parent) {
  const childHostId = requiredText(input.childHostId, 'childHostId');
  if (childHostId === parent.hostId) throw transmissionError('Child Host must have a distinct identity.');
  const constitution = childConstitution(parent, childHostId);
  const child = await store.createSession(db, {
    hostId: childHostId, scope: 'PERSISTENT', constitution,
    constitutionId: constitution.constitutionId,
    transmissionState: { parentHolobiontId: parent.holobiontId, generation: Number(input.generation || 1) }
  });
  return { child, constitution };
}

function templateFor(contract, childHostId) {
  const { contractId, revision, createdAt, status, ...template } = contract;
  return { ...template, hostId: childHostId, status: 'ACTIVE' };
}

async function inheritOne(context) {
  const { db, input, parent, child, source } = context;
  const contract = await contracts.getContract(db, parent.holobiontId, source.id);
  if (!contract || contract.status !== 'ACTIVE') return { symbiontId: source.id, status: 'SKIPPED', reason: 'ACTIVE_CONTRACT_REQUIRED' };
  const decision = decideInheritance(parent.constitution.transmissionPolicy, contract.transmissionPolicy);
  if (!decision.inherit) return { symbiontId: source.id, status: decision.reacquire ? 'REACQUIRE' : 'NOT_INHERITED', reason: decision.reason };
  const validation = await validateInheritedSymbiont({
    symbiont: source, contract, evidenceRefs: input.evidenceRefs,
    actorId: input.actorId, riskScore: input.riskScore
  });
  if (!validation.allowed) return { symbiontId: source.id, status: 'BLOCKED', reason: 'AEIS_REJECTION', immuneReview: validation.review };
  const candidate = inheritedCandidate(source);
  candidate.definition = validation.definition;
  const revision = await store.appendEvent(db, {
    holobiontId: child.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
    expectedRevision: child.revision, actorId: input.actorId,
    payload: { symbiontId: source.id, symbiont: candidate }
  });
  await contracts.createContract(db, {
    holobiontId: child.holobiontId, expectedSessionRevision: revision,
    actorId: input.actorId, contract: templateFor(contract, child.hostId)
  });
  return { symbiontId: source.id, status: 'CANDIDATE', required: decision.required, immuneReview: validation.review };
}

async function transmitVertically(db, input = {}) {
  const parent = await store.getSession(db, requiredText(input.parentHolobiontId, 'parentHolobiontId'));
  if (!parent) throw transmissionError('Parent Host not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  parentRequirements(parent);
  if (Number(input.expectedParentRevision) !== parent.revision) {
    throw transmissionError('Parent Host revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const { child, constitution } = await createChild(db, input, parent);
  const results = [];
  for (const source of parent.residentSymbionts.filter((item) => item.status === 'RESIDENT')) {
    results.push(await inheritOne({ db, input, parent, child, source }));
  }
  await store.appendEvent(db, {
    holobiontId: parent.holobiontId, eventType: 'VERTICAL_TRANSMISSION',
    expectedRevision: parent.revision, actorId: input.actorId,
    payload: { childHolobiontId: child.holobiontId, childHostId: child.hostId,
      inheritedSymbiontIds: results.filter((item) => item.status === 'CANDIDATE').map((item) => item.symbiontId) }
  });
  const childSession = await store.getSession(db, child.holobiontId);
  return { parentHolobiontId: parent.holobiontId, child: childSession, constitution, results };
}

module.exports = { transmitVertically };
