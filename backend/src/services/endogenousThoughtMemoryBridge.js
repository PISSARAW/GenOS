'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

function verdictOf(input) {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return null;
  return input.verdict || input.payload?.verdict || input.learning?.receipt?.payload?.verdict || null;
}

function isDurableTruth(verdict) {
  return verdict === 'supported';
}

function beliefCategory(verdict) {
  if (verdict === 'supported') return 'Experience';
  if (verdict === 'refuted') return 'Failure';
  return 'UnverifiedExperience';
}

function durable(verdict) {
  return verdict === 'supported';
}

function canWake(signal, mandate) {
  const hasSignal = Boolean(signal) && (typeof signal !== 'object' || Object.keys(signal).length > 0);
  let mandateActive = Boolean(mandate);
  if (mandate && typeof mandate === 'object') {
    mandateActive = mandate.status === 'active' || mandate.active === true || Number.isFinite(mandate.mandateVersion);
  }
  return hasSignal && mandateActive;
}

function shouldWake(signal, mandate) {
  return canWake(signal, mandate);
}

function wakeAllowed(signal, mandate) {
  return canWake(signal, mandate);
}

function markRefutedItem(item, subject) {
  if (!item || typeof item !== 'object') return;
  const text = String(item.content || item.summary || '');
  if (subject && !text.includes(subject)) return;
  item.synaptic_weight = Math.min(Number(item.synaptic_weight) || 1, -1);
  item._ettRefuted = true;
}

function modifySearchResults(results, beliefs) {
  const list = Array.isArray(results) ? results.slice() : [];
  const beliefList = Array.isArray(beliefs) ? beliefs : [];
  for (const belief of beliefList) {
    if (!belief || belief.verdict !== 'refuted') continue;
    const subject = belief.subject || '';
    for (const item of list) markRefutedItem(item, subject);
  }
  return list;
}

function resolvePayload(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.payload && typeof input.payload === 'object') return input.payload;
  if (input.learning && input.learning.receipt && input.learning.receipt.payload) {
    return input.learning.receipt.payload;
  }
  return input;
}

function pick(payload, input, key) {
  if (payload && payload[key] != null) return payload[key];
  if (input && input[key] != null) return input[key];
  return undefined;
}

function beliefDocument(context) {
  const { payload, input, fields, verdict } = context;
  const question = input.question && typeof input.question === 'object' ? input.question : {};
  const verification = input.verification && typeof input.verification === 'object'
    ? input.verification : {};
  return { schema: 'genos.EndogenousVerifiedBelief/v1', beliefId: pick(payload, input, 'learningId'),
    verdict, revision: pick(payload, input, 'revision'),
    claim: { hypothesis: question.hypothesis, method: question.method,
      falsifier: question.falsifier, expectedEvidence: question.expectedEvidence,
      sourceRefs: question.sourceRefs },
    verification: { verificationId: pick(payload, input, 'verificationId'),
      verificationRef: pick(payload, input, 'verificationRef'),
      verifierId: verification.verifier?.id, oracleRef: verification.oracleRef,
      evidenceRefs: pick(payload, input, 'evidenceRefs'), verifiedAt: verification.verifiedAt },
    provenance: { organizationId: fields.organizationId, projectId: fields.projectId,
      episodeId: fields.episodeId, agentId: fields.agentId, questionRef: fields.questionRef,
      runId: pick(payload, input, 'runId'), learnedAt: pick(payload, input, 'learnedAt') } };
}

async function storeMemory(db, document, fields) {
  const vectorMemory = require('./vectorMemoryService');
  return vectorMemory.storeMemory(fields.agentId, canonicalJson(document), null, {
    db, category: fields.category,
    tags: ['ett', String(document.verdict || 'unknown'), fields.isDurable ? 'durable' : 'non-durable'],
    organizationId: fields.organizationId, projectId: fields.projectId,
    title: `ETT ${document.verdict || 'belief'}: ${document.claim.hypothesis || fields.episodeId}`,
    synapticWeight: fields.isDurable ? 1.0 : 0.1
  });
}

function resolveFields(payload, input, verdict) {
  const agentId = pick(payload, input, 'agentId') || pick(payload, input, 'agent') || 'agent';
  const projectId = pick(payload, input, 'projectId') || null;
  const organizationId = pick(payload, input, 'organizationId') || null;
  const questionRef = pick(payload, input, 'questionRef') || null;
  const episodeId = pick(payload, input, 'episodeId') || null;
  const category = beliefCategory(verdict);
  const isDurable = durable(verdict);
  return { agentId, projectId, organizationId, questionRef, episodeId, category, isDurable };
}

async function recordVerifiedBelief(db, input) {
  const payload = resolvePayload(input);
  const verdict = verdictOf(payload || input);
  const fields = resolveFields(payload, input, verdict);
  const document = beliefDocument({ payload, input, fields, verdict });
  const memoryId = await storeMemory(db, document, fields);
  if (typeof memoryId !== 'string' || !memoryId.trim()) {
    throw Object.assign(new Error('Verified belief memory was not persisted.'), {
      code: 'ENDOGENOUS_MEMORY_NOT_PERSISTED' });
  }
  const beliefId = pick(payload, input, 'learningId') || null;
  const provenanceRef = beliefId || pick(payload, input, 'verificationRef') || null;
  return {
    memoryId: memoryId,
    memoryRef: memoryId,
    beliefId: beliefId,
    verdict: verdict,
    category: fields.category,
    durable: fields.isDurable,
    productionMemoryMutated: true,
    provenanceRef: provenanceRef,
    contentDigest: crypto.createHash('sha256')
      .update(canonicalJson(document)).digest('hex')
  };
}

async function recordBelief(db, input) {
  return recordVerifiedBelief(db, input);
}

async function applyVerifiedBelief(db, input) {
  return recordVerifiedBelief(db, input);
}

module.exports = {
  recordVerifiedBelief: recordVerifiedBelief,
  recordBelief: recordBelief,
  applyVerifiedBelief: applyVerifiedBelief,
  applyBeliefToSearch: modifySearchResults,
  modifySearch: modifySearchResults,
  modifySearchResults: modifySearchResults,
  canWake: canWake,
  shouldWake: shouldWake,
  wakeAllowed: wakeAllowed,
  wakeAllowedSignalMandate: canWake,
  isDurableTruth: isDurableTruth,
  beliefCategory: beliefCategory,
  durable: durable
};
