'use strict';

const crypto = require('node:crypto');
const { appendEvent, getEvent } = require('../gvxDevelopmentLedger');

const SIGNAL_TYPES = Object.freeze([
  'prediction_error', 'persistent_regret', 'successful_pathway', 'pathway_decompiled',
  'active_query', 'skill_gap', 'counterfactual_discrimination', 'morphology_pattern',
  'representation_failure'
]);

async function recordAgowSignal(db, input) {
  validateSignal(input);
  const id = eventId(input);
  const prior = await getEvent(db, id, ledgerScope(input));
  const event = prior || await appendEvent(db, {
    id, ...input.scope, entityId: input.entityId, type: 'evidence_attached',
    payload: { kind: 'developmental_signal', signalId: input.signalId, sourceSystem: 'agow',
      sourceEventId: input.sourceEventId, signalType: input.signalType,
      observedAt: input.observedAt || new Date().toISOString(),
      epistemicStatus: 'reported', evidenceRefs: [...new Set(input.evidenceRefs)],
      context: safeContext(input.context) }
  });
  const result = prior ? { ...event, replayed: true } : event;
  try {
    result.developmentalAction = await require('../gvxDevelopmentController').processSignal(db, {
      scope: input.scope, entityId: input.entityId, sourceEventId: input.sourceEventId,
      signalType: input.signalType, evidenceRefs: input.evidenceRefs, context: safeContext(input.context)
    });
  } catch (error) {
    result.developmentalAction = { status: 'deferred', reason: error.code || 'gvx-controller-unavailable' };
  }
  return result;
}

async function recordOutcomeSignals(db, input) {
  const events = [];
  for (const signalType of deriveOutcomeSignals(input)) {
    events.push(await recordAgowSignal(db, {
      ...input, signalType, signalId: `${input.sourceEventId}:${signalType}`
    }));
  }
  return events;
}

function deriveOutcomeSignals(input) {
  const result = [];
  const error = Number(input.predictionError);
  if (Number.isFinite(error) && Math.abs(error) >= 0.5) result.push('prediction_error');
  if (Number(input.regret) >= 0.5) result.push('persistent_regret');
  if (input.success === true && input.pathwayId) result.push('successful_pathway');
  if (input.decompiled === true) result.push('pathway_decompiled');
  return result;
}

function validateSignal(input) {
  if (!hasSignalIdentity(input) || !hasSignalEvidence(input)) {
    throw Object.assign(new Error('AGOW developmental signal is invalid.'), { code: 'DEVELOPMENTAL_SIGNAL_INVALID' });
  }
}

function hasSignalIdentity(input) {
  return Boolean(input && input.scope?.organizationId && input.scope?.projectId
    && input.entityId && input.agentId && input.signalId && input.sourceEventId
    && SIGNAL_TYPES.includes(input.signalType));
}

function hasSignalEvidence(input) {
  return Array.isArray(input.evidenceRefs) && input.evidenceRefs.length > 0
    && input.evidenceRefs.every(nonEmptyText);
}

function nonEmptyText(value) { return typeof value === 'string' && Boolean(value.trim()); }
function safeContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  return Object.fromEntries(['pathwayId', 'candidateId', 'frameId', 'queryId', 'contextHash']
    .filter((key) => typeof context[key] === 'string' && context[key].length <= 200)
    .map((key) => [key, context[key]]));
}

function ledgerScope(input) { return { ...input.scope, entityId: input.entityId }; }

function eventId(input) {
  const identity = [input.scope.organizationId, input.scope.projectId, input.entityId, input.signalId].join('\0');
  return `agow-signal:${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

module.exports = { SIGNAL_TYPES, deriveOutcomeSignals, recordAgowSignal, recordOutcomeSignals };
