'use strict';

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

async function tryStoreMemory(verdict, fields) {
  try {
    const vectorMemory = require('./vectorMemoryService');
    const content = `[ETT ${String(verdict || 'unknown').toUpperCase()} BELIEF] episode=${fields.episodeId || ''} agent=${fields.agentId} project=${fields.projectId || ''} question=${fields.questionRef || ''}`;
    return await vectorMemory.storeMemory(fields.agentId, content, null, {
      category: fields.category,
      tags: ['ett', String(verdict || 'unknown'), fields.isDurable ? 'durable' : 'non-durable'],
      organizationId: fields.organizationId,
      projectId: fields.projectId,
      title: `ETT ${verdict || 'belief'}`,
      synapticWeight: fields.isDurable ? 1.0 : 0.1
    });
  } catch (_) {
    return null;
  }
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
  const memoryId = await tryStoreMemory(verdict, fields);
  const beliefId = pick(payload, input, 'learningId') || null;
  const provenanceRef = beliefId || pick(payload, input, 'verificationRef') || null;
  return {
    memoryId: memoryId,
    memoryRef: memoryId,
    beliefId: beliefId,
    verdict: verdict,
    category: fields.category,
    durable: fields.isDurable,
    productionMemoryMutated: fields.isDurable,
    provenanceRef: provenanceRef
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
