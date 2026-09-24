'use strict';

const contexts = require('./causalContext');
const vectors = require('./versionVectorService');

function record(operation, frontier = {}) {
  const actorId = String(operation.actorId || operation.agentId || '').trim() || 'unknown';
  const causalContext = contexts.normalize(operation.causalContext || frontier);
  const dot = normalizeDot(operation.dot, actorId, causalContext);
  const versionVector = vectors.observe(causalContext, dot.actorId, dot.sequence);
  return { ...operation, actorId, dot, causalContext, versionVector };
}

function normalizeDot(dot, actorId, causalContext) {
  if (dot == null) return { actorId, sequence: (causalContext[actorId] || 0) + 1 };
  if (dot.actorId !== actorId || !Number.isSafeInteger(dot.sequence) || dot.sequence < 1) {
    throw Object.assign(new Error('Operation dot must match its actor and use a positive sequence.'), { code: 'SYNCYTIUM_CAUSAL_DOT_INVALID' });
  }
  if (dot.sequence !== (causalContext[actorId] || 0) + 1) {
    throw Object.assign(new Error('Operation dot must immediately follow its actor causal context.'), { code: 'SYNCYTIUM_CAUSAL_DOT_INVALID' });
  }
  return { actorId, sequence: dot.sequence };
}

module.exports = { record };
