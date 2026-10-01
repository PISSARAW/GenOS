'use strict';

const { randomUUID } = require('crypto');
const { evaluateAllGates } = require('./morphogenesis/plasmidGateService');
const { appendEvent, listEvents } = require('./gvxDevelopmentLedger');

const TRANSITIONS = Object.freeze({
  quarantined: ['trial'],
  trial: ['rejected', 'review_ready'],
  rejected: [],
  review_ready: ['rejected', 'assimilated'],
  assimilated: ['rejected', 'monitored'],
  monitored: ['rejected', 'consolidated'],
  consolidated: []
});
const HASH = /^[a-f0-9]{64}$/;

function validateStart(input) {
  if (!input || !input.scope || !input.plasmid || !input.recipient || !input.entityId) return ['transfer-context-required'];
  if (!input.sourceLineage || !input.contextHash || !HASH.test(input.contextHash)) return ['transfer-provenance-required'];
  if (!input.recipient.id) return ['transfer-recipient-required'];
  return [];
}

async function startTransfer(db, input) {
  const errors = validateStart(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_TRANSFER_INVALID', errors });
  const gates = evaluateAllGates(input.plasmid, input.recipient);
  const transfer = {
    transferId: input.transferId || randomUUID(),
    sourceLineage: input.sourceLineage,
    recipientId: input.recipient.id,
    plasmidId: input.plasmid.id,
    plasmidHash: input.plasmidHash || null,
    contextHash: input.contextHash,
    state: gates.passed ? 'quarantined' : 'rejected',
    gateResults: gates,
    rationale: gates.passed ? 'await_local_trial' : 'gate_rejected'
  };
  return appendEvent(db, {
    organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    entityId: input.entityId, type: 'transfer_recorded', payload: { transfer }
  });
}

async function advanceTransfer(db, input) {
  const events = await listEvents(db, input);
  const previous = latestTransfer(events, input.transferId);
  const next = input.state;
  assertTransition(previous, next);
  const evidence = validateTransitionEvidence(input, next);
  if (evidence.length) throw Object.assign(new Error(evidence.join(',')), { code: 'GVX_TRANSFER_EVIDENCE_REQUIRED', errors: evidence });
  const transfer = { ...previous, state: next, rationale: input.rationale || next,
    trialEvidence: input.trialEvidence || previous.trialEvidence || [],
    recipientOutcome: input.recipientOutcome || previous.recipientOutcome || null,
    monitoring: input.monitoring || previous.monitoring || null };
  return appendEvent(db, {
    organizationId: input.organizationId, projectId: input.projectId,
    entityId: input.entityId, type: 'transfer_recorded', payload: { transfer }
  });
}

function latestTransfer(events, transferId) {
  const matches = events.filter((event) => event.type === 'transfer_recorded'
    && event.payload.transfer?.transferId === transferId);
  if (!matches.length) throw Object.assign(new Error('gvx-transfer-not-found'), { code: 'GVX_TRANSFER_NOT_FOUND' });
  return matches[matches.length - 1].payload.transfer;
}

function assertTransition(previous, next) {
  if (!TRANSITIONS[previous.state]?.includes(next)) {
    throw Object.assign(new Error('gvx-transfer-transition-invalid'), { code: 'GVX_TRANSFER_TRANSITION_INVALID' });
  }
}

function validateTransitionEvidence(input, next) {
  if (next === 'assimilated') return validateRecipientOutcome(input.recipientOutcome);
  if (next === 'monitored') return validateMonitoring(input.monitoring, 2);
  if (next === 'consolidated') return validateMonitoring(input.monitoring, 3);
  if (next !== 'review_ready') return [];
  const trials = input.trialEvidence;
  if (!Number.isInteger(input.minTrials) || input.minTrials < 1) return ['minimum-trial-count-required'];
  if (!Array.isArray(trials) || trials.length < input.minTrials) return ['replicated-trial-evidence-required'];
  return trials.every(validTrial) ? [] : ['trial-evidence-invalid'];
}

function validateRecipientOutcome(outcome) {
  if (!validRecipientEvidence(outcome)) return ['recipient-outcome-evidence-required'];
  return hasImprovement(outcome) ? [] : ['recipient-outcome-improvement-required'];
}

function validRecipientEvidence(outcome) {
  return Boolean(outcome && HASH.test(outcome.artifactHash || '') && outcome.verifierId
    && outcome.metric && Number.isFinite(outcome.baseline) && Number.isFinite(outcome.candidate));
}

function hasImprovement(outcome) {
  const higher = outcome.direction === 'higher' && outcome.candidate > outcome.baseline;
  const lower = outcome.direction === 'lower' && outcome.candidate < outcome.baseline;
  return (higher || lower) && outcome.regression === false;
}

function validateMonitoring(monitoring, minimumWindows) {
  if (!monitoring || !Array.isArray(monitoring.windows) || monitoring.windows.length < minimumWindows) return ['transfer-monitoring-windows-required'];
  const contexts = new Set(monitoring.windows.map((window) => window.contextHash).filter(Boolean));
  const verified = monitoring.windows.every((window) => HASH.test(window.artifactHash || '') && window.verifierId && window.regression === false);
  return contexts.size >= minimumWindows && verified ? [] : ['transfer-monitoring-evidence-invalid'];
}

function validTrial(trial) {
  return Boolean(trial && HASH.test(trial.artifactHash || '')
    && typeof trial.verifierId === 'string' && trial.verifierId.trim());
}

module.exports = { TRANSITIONS, startTransfer, advanceTransfer, validateStart, validateRecipientOutcome, validateMonitoring };
