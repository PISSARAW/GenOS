'use strict';

const { randomUUID } = require('crypto');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const memory = require('../memory/symbioticMemoryService');
const contributions = require('../fitness/symbiontContributionService');

function interactionError(message, code = 'HOLOBIONT_INTERACTION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const result = String(value || '').trim();
  if (!result) throw interactionError(`${field} is required.`);
  return result;
}

async function producerContext(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw interactionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (!session.residentSymbionts.some((item) => item.id === input.producerSymbiontId && item.status === 'RESIDENT')) {
    throw interactionError('Only a resident symbiont can publish an intermediate value.', 'HOLOBIONT_SYMBIONT_NOT_RESIDENT');
  }
  const authorization = await contracts.authorizeSymbiontWork(db, {
    holobiontId: session.holobiontId, symbiontId: input.producerSymbiontId,
    capability: input.producerCapability
  });
  return { session, authorization };
}

async function publishIntermediateValue(db, input = {}) {
  const { session, authorization } = await producerContext(db, input);
  if (Number(input.expectedSessionRevision) !== session.revision) throw interactionError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map((item) => text(item, 'evidence reference')) : [];
  if (!evidenceRefs.length) throw interactionError('Intermediate value requires evidence.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  const value = {
    type: 'INTERMEDIATE_VALUE', valueId: randomUUID(), valueType: text(input.valueType, 'valueType'),
    payload: input.payload, producerSymbiontId: input.producerSymbiontId,
    producerCapability: input.producerCapability, contractId: authorization.contractId,
    contractRevision: authorization.revision
  };
  if (value.payload === undefined || value.payload === null) throw interactionError('Intermediate payload is required.');
  const memoryRecord = await memory.recordMemory(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    memoryType: 'EPISODIC', scope: session.scope, content: value,
    evidenceRefs, dataClasses: input.dataClasses || [], authorId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  return memoryRecord.accepted === false
    ? { accepted: false, reason: memoryRecord.reason, immuneReview: memoryRecord.immuneReview }
    : { accepted: true, valueId: value.valueId, memoryId: memoryRecord.memoryId, value };
}

async function findIntermediateValue(db, input) {
  const records = await memory.recallMemories(db, { holobiontId: input.holobiontId, memoryType: 'EPISODIC' });
  const record = records.find((item) => item.memoryId === input.valueMemoryId && item.content.type === 'INTERMEDIATE_VALUE');
  if (!record) throw interactionError('Intermediate value was not found for this Host.', 'HOLOBIONT_INTERMEDIATE_VALUE_NOT_FOUND');
  return record;
}

async function consumeContext(db, input) {
  let session = await store.getSession(db, input.holobiontId);
  if (!session) throw interactionError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) throw interactionError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  const consumerId = text(input.consumerSymbiontId, 'consumerSymbiontId');
  if (!session.residentSymbionts.some((item) => item.id === consumerId && item.status === 'RESIDENT')) {
    throw interactionError('Only a resident symbiont can consume an intermediate value.', 'HOLOBIONT_SYMBIONT_NOT_RESIDENT');
  }
  const consumer = await contracts.authorizeSymbiontWork(db, {
    holobiontId: session.holobiontId, symbiontId: consumerId, capability: input.consumerCapability
  });
  const source = await findIntermediateValue(db, input);
  if (source.content.producerSymbiontId === consumerId) throw interactionError('A producer cannot consume its own intermediate as cross-feeding.');
  return { session, consumerId, consumer, source };
}

async function creditProducer(context) {
  const { db, input, session, source } = context;
  return contributions.recordContribution(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    symbiontId: source.content.producerSymbiontId, capability: source.content.producerCapability,
    receiptId: randomUUID(), benefitScore: input.producerBenefitScore,
    evidenceQuality: input.producerEvidenceQuality, costScore: input.producerCostScore,
    riskScore: input.riskScore || 0, resourcesConsumed: input.resourcesConsumed || {},
    verification: input.producerVerification, verifierId: input.verifierId
  });
}

function consumptionEvidence(input) {
  const evidenceRefs = Array.isArray(input.consumptionEvidenceRefs)
    ? input.consumptionEvidenceRefs.map((item) => text(item, 'consumption evidence')) : [];
  if (!evidenceRefs.length) throw interactionError('Consumption evidence is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  return evidenceRefs;
}

async function recordConsumption(context) {
  const { db, input, session, consumerId, consumer, source, producerCredit } = context;
  const evidenceRefs = consumptionEvidence(input);
  return memory.recordMemory(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    memoryType: 'EPISODIC', scope: session.scope,
    content: { type: 'INTERMEDIATE_CONSUMPTION', valueMemoryId: source.memoryId,
      valueId: source.content.valueId, producerSymbiontId: source.content.producerSymbiontId,
      consumerSymbiontId: consumerId, consumerContractId: consumer.contractId,
      producerLedgerId: producerCredit.ledgerId },
    evidenceRefs, dataClasses: input.dataClasses || [], authorId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
}

async function consumeIntermediateValue(db, input = {}) {
  const context = await consumeContext(db, input);
  const producerCredit = await creditProducer({ db, input, ...context });
  if (producerCredit.accepted === false) return { accepted: false, reason: producerCredit.reason, producerCredit };
  const session = await store.getSession(db, context.session.holobiontId);
  const consumed = await recordConsumption({ ...context, db, input, session, producerCredit });
  return consumed.accepted === false
    ? { accepted: false, reason: consumed.reason, producerCredit, immuneReview: consumed.immuneReview }
    : { accepted: true, producerCredit, consumptionMemoryId: consumed.memoryId, valueId: context.source.content.valueId };
}

module.exports = { publishIntermediateValue, consumeIntermediateValue };
