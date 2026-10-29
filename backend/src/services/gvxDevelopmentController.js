'use strict';

const crypto = require('node:crypto');
const { appendEvent, getEvent, listAllEvents } = require('./gvxDevelopmentLedger');
const { recommendAction } = require('./developmentalBridge');

function signalKey(input) {
  const parts = [input.scope.organizationId, input.scope.projectId, input.entityId,
    input.signalType, input.context?.pathwayId || 'global'];
  if (input.gvxTrialContext) parts.push(input.gvxTrialContext.profileHash);
  return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

function matchingSignals(events, input) {
  return events.filter((event) => event.payload.kind === 'developmental_signal'
    && event.payload.signalType === input.signalType
    && matchesTrialProfile(event, input)
    && (event.payload.context?.pathwayId || 'global') === (input.context?.pathwayId || 'global'));
}

function matchesTrialProfile(event, input) {
  const profileHash = input.gvxTrialContext?.profileHash || null;
  return (event.payload.runtimeProfileHash || null) === profileHash;
}

function uniqueSources(events) {
  return [...new Set(events.map((event) => event.payload.sourceEventId).filter(Boolean))];
}

async function processSignal(db, input) {
  const trialProfile = require('./gvxTrialRuntimeProfile');
  trialProfile.assertMode(input.gvxTrialContext, 'acquisition');
  trialProfile.assertScope(input.gvxTrialContext, input.scope, input.entityId);
  validateInput(input);
  const scope = { ...input.scope, entityId: input.entityId };
  const events = await listAllEvents(db, scope);
  const matches = matchingSignals(events, input);
  const sourceEventIds = uniqueSources(matches);
  const action = recommendAction(input.signalType, sourceEventIds.length);
  const key = signalKey(input);
  const id = `gvx-development-action:${key}:${input.sourceEventId}`;
  const existing = await getEvent(db, id, scope);
  if (existing) return { ...existing, replayed: true };
  return appendEvent(db, {
    id, ...input.scope, entityId: input.entityId, type: 'decision_recorded',
    payload: { kind: 'development_controller_action', status: 'proposed', action,
      signalType: input.signalType, signalCount: sourceEventIds.length,
      ...(input.gvxTrialContext ? { runtimeProfileHash: input.gvxTrialContext.profileHash } : {}),
      sourceEventIds, evidenceRefs: [...new Set(input.evidenceRefs)],
      epistemicStatus: 'reported', promotionAllowed: false }
  });
}

async function runCycle(db, input) {
  const signal = input.signal;
  const action = await processSignal(db, signal);
  if (!['create_hypothesis', 'schedule_experiment'].includes(action.payload.action)) {
    return { status: 'accumulating_evidence', action, promotionAllowed: false };
  }
  require('./gvxTrialRuntimeProfile').assertMode(signal.gvxTrialContext, 'evolution');
  validateCycleAdapters(input);
  return require('./gvxCycleJournal').runCycle({ db, input, signal, action },
    require('./gvxCycleExecution').execute);
}

function validateCycleAdapters(input) {
  const required = ['hypothesisPlanner', 'experimentInput', 'assessmentInput',
    'developmentalReceiptInput', 'applicationInput', 'monitorInput'];
  if (required.some((key) => typeof input[key] !== 'function')
      || typeof input.selfTwinPredictor !== 'function'
      || !/^[a-f0-9]{64}$/.test(input.controlFingerprint || '')) {
    throw Object.assign(new Error('GVX lifecycle control-plane adapters are required.'), {
      code: 'GVX_CONTROLLER_ADAPTERS_REQUIRED'
    });
  }
}

function validateInput(input) {
  if (!input?.scope?.organizationId || !input.scope.projectId || !input.entityId
      || !input.sourceEventId || !input.signalType || !Array.isArray(input.evidenceRefs)
      || input.evidenceRefs.length === 0) {
    throw Object.assign(new Error('GVX controller requires a scoped, evidence-linked signal.'), {
      code: 'GVX_CONTROLLER_SIGNAL_INVALID'
    });
  }
}

module.exports = { processSignal, runCycle, matchingSignals, uniqueSources };
