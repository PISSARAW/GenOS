'use strict';

const bridge = require('../epistemic/stigmergyInterProcessBridge');

function normalized(values) {
  return [...new Set(values || [])].sort();
}

function sameValues(left, right) {
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function sameScope(traceScope, requested) {
  if (!requested) return true;
  return ['organizationId', 'projectId'].every((key) =>
    requested[key] == null || traceScope?.[key] === requested[key]);
}

function matches(trace, ctx) {
  const envelope = trace.communicationEnvelope;
  const evidence = ctx.evidence || {};
  if (!envelope || trace.type !== bridge.SIGNAL_TYPES.CHECKPOINT_STIGMERGY) return false;
  if (trace.isRepellent || trace.payload?.content?.checkpoint !== ctx.checkpoint) return false;
  const semanticRefs = evidence.semanticRefs || [];
  const artifactRefs = evidence.artifactId ? [evidence.artifactId] : [];
  return sameScope(envelope.scope, ctx.scope)
    && sameValues(envelope.semanticRefs, semanticRefs)
    && sameValues(envelope.artifactRefs, artifactRefs);
}

async function readAvailableTraces(ctx, locus) {
  try {
    return await bridge.readPheromones({ db: ctx.db, locus, limit: 50 });
  } catch (error) {
    if (/no such table/i.test(error.message || '')) return [];
    throw error;
  }
}

async function priorDecision(ctx) {
  const evidence = ctx.evidence || {};
  if (!(evidence.semanticRefs?.length || evidence.artifactId)) return null;
  const locus = `checkpoint/${evidence.domain || 'general'}`;
  const traces = await readAvailableTraces(ctx, locus);
  const trace = traces.find((item) => matches(item, ctx));
  if (!trace) return null;
  return {
    action: 'SILENCE', scope: 'SELF', recipients: [],
    encoding: 'semantic-fingerprint', grounding: 'none', ttlMs: 0,
    reasonCodes: ['STIGMERGY_TRACE_REUSED'],
    meta: { stage: 'stigmergy', utility: 0, gain: 0, cost: 0,
      traceId: trace.communicationEnvelope.messageId }
  };
}

module.exports = { priorDecision };
