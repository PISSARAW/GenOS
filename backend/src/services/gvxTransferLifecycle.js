'use strict';

const { randomUUID } = require('crypto');
const { evaluateAllGates } = require('./morphogenesis/plasmidGateService');
const { appendEvent, listEvents } = require('./gvxDevelopmentLedger');

const TRANSITIONS = Object.freeze({
  quarantined: ['trial'],
  trial: ['rejected', 'review_ready'],
  rejected: [],
  review_ready: []
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
  const evidence = validateTrialEvidence(input, next);
  if (evidence.length) throw Object.assign(new Error(evidence.join(',')), { code: 'GVX_TRANSFER_EVIDENCE_REQUIRED', errors: evidence });
  const transfer = { ...previous, state: next, rationale: input.rationale || next, trialEvidence: input.trialEvidence || [] };
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

function validateTrialEvidence(input, next) {
  if (next !== 'review_ready') return [];
  const trials = input.trialEvidence;
  if (!Number.isInteger(input.minTrials) || input.minTrials < 1) return ['minimum-trial-count-required'];
  if (!Array.isArray(trials) || trials.length < input.minTrials) return ['replicated-trial-evidence-required'];
  return trials.every(validTrial) ? [] : ['trial-evidence-invalid'];
}

function validTrial(trial) {
  return Boolean(trial && HASH.test(trial.artifactHash || '')
    && typeof trial.verifierId === 'string' && trial.verifierId.trim());
}

module.exports = { TRANSITIONS, startTransfer, advanceTransfer, validateStart };
