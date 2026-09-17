'use strict';

const telemetry = require('./telemetryObserver');

const EFFECTS = Object.freeze({
  require_evidence: { eventType: 'PHILOSOPHY_EVIDENCE_REQUIRED', action: 'REQUIRE_EVIDENCE' },
  hold_promotion: { eventType: 'PHILOSOPHY_PROMOTION_HELD', action: 'HOLD_PROMOTION' },
  prefer_observation: { eventType: 'PHILOSOPHY_OBSERVATION_PREFERRED', action: 'PREFER_OBSERVATION' },
});

function validateRequest(request) {
  const input = request || {};
  if (!input.concept || !input.agentId) throw new Error('philosophyRuntimeEffectService requires concept and agentId');
  const effect = EFFECTS[input.effect];
  if (!effect) throw new Error(`Unsupported philosophy runtime effect '${input.effect}'.`);
  return { input, effect };
}

function previewRuntimeEffect(request = {}) {
  const { input, effect } = validateRequest(request);
  return {
    applied: false,
    mode: 'preview',
    concept: input.concept,
    agentId: input.agentId,
    effect: input.effect,
    eventType: effect.eventType,
    action: effect.action,
    parameters: input.parameters || {},
    requiresApply: true,
  };
}

function applyRuntimeEffect(request = {}) {
  const preview = previewRuntimeEffect(request);
  if (request.apply !== true) return preview;
  const event = telemetry.emitEvent({
    eventType: preview.eventType,
    agentId: preview.agentId,
    action: preview.action,
    detail: `Controlled philosophy effect '${preview.effect}' applied to ${preview.concept}.`,
    severity: 'info',
    payload: { concept: preview.concept, effect: preview.effect, parameters: preview.parameters, controlled: true },
  });
  return { ...preview, applied: true, mode: 'apply', receipt: { eventId: event.id, eventType: event.eventType } };
}

module.exports = { EFFECTS, previewRuntimeEffect, applyRuntimeEffect };
