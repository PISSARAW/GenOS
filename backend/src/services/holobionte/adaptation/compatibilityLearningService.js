'use strict';

const contracts = require('../contracts/symbiosisContractService');
const memory = require('../memory/symbioticMemoryService');
const store = require('../holobiontStore');

function adaptationError(message, code = 'HOLOBIONT_ADAPTATION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const result = String(value || '').trim();
  if (!result) throw adaptationError(`${field} is required.`);
  return result;
}

function textList(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw adaptationError(`${field} must contain evidence.`);
  return value.map((item) => text(item, field));
}

function qualityScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) throw adaptationError('qualityScore must be between 0 and 1.');
  return score;
}

async function recordCompatibility(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw adaptationError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  const authorization = await contracts.authorizeSymbiontWork(db, {
    holobiontId: session.holobiontId, symbiontId: input.symbiontId,
    capability: input.capability
  });
  const observation = {
    symbiontId: input.symbiontId,
    capability: text(input.capability, 'capability'),
    qualityScore: qualityScore(input.qualityScore),
    context: text(input.context, 'context'),
    requiredInputs: textList(input.requiredInputs, 'requiredInputs'),
    evidenceProduced: textList(input.evidenceProduced, 'evidenceProduced'),
    evidenceRefs: textList(input.evidenceRefs, 'evidenceRefs'),
    hostOntology: text(input.hostOntology, 'hostOntology'),
    hostConventions: textList(input.hostConventions, 'hostConventions'),
    errorPatterns: textList(input.errorPatterns, 'errorPatterns'),
    preferredOutputShape: text(input.preferredOutputShape, 'preferredOutputShape'),
    contractId: authorization.contractId,
    contractRevision: authorization.revision
  };
  const record = await memory.recordMemory(db, {
    holobiontId: session.holobiontId,
    expectedSessionRevision: input.expectedSessionRevision,
    memoryType: 'PARTNER_REPUTATION', scope: session.scope,
    content: { type: 'COMPATIBILITY_OBSERVATION', ...observation },
    evidenceRefs: observation.evidenceRefs,
    dataClasses: input.dataClasses || [], authorId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  return record.accepted === false ? record : { ...record, observation };
}

module.exports = { recordCompatibility };
