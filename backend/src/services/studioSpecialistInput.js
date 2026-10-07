'use strict';
const { failure } = require('./studioWorldsService');

function text(value, limit = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw failure('SPECIALIST_INPUT_INVALID', 400);
  return value.trim();
}

function number(value, bounds) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds[0] || value > bounds[1]) {
    throw failure('SPECIALIST_INPUT_INVALID', 400);
  }
  return value;
}

function validateNode(value, depth = 0) {
  if (depth > 12) throw failure('SPECIALIST_INPUT_INVALID', 400);
  if (Array.isArray(value) && value.length > 100) throw failure('SPECIALIST_INPUT_INVALID', 400);
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw failure('SPECIALIST_INPUT_INVALID', 400);
    validateNode(item, depth + 1);
  }
}

function object(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(text(value, 32000)); } catch (_) { throw failure('SPECIALIST_INPUT_INVALID', 400); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw failure('SPECIALIST_INPUT_INVALID', 400);
  if (JSON.stringify(parsed).length > 32000) throw failure('SPECIALIST_INPUT_INVALID', 400);
  validateNode(parsed);
  return parsed;
}

async function record(db, context, observation) {
  const saved = await require('./decisionEvidenceService').persistDecision({ db, scope: context.scope,
    createdBy: context.actor, title: 'Studio : ' + observation.mechanism, category: 'StudioSpecialistAnalysis',
    content: JSON.stringify({ agentId: context.agentId, ...observation }), evidenceRefs: [] });
  return { ...observation.result, analysisId: saved.id, provenanceHash: saved.provenanceHash,
    evidenceStatus: saved.evidenceStatus, promotionGranted: false, truthValidated: false };
}

module.exports = { text, number, object, record };
