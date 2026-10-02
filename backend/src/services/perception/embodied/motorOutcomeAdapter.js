'use strict';

const { randomUUID } = require('node:crypto');

async function execute(options) {
  validate(options);
  if (requiresApproval(options)) return blockedOutcome(options);
  const outcome = await options.environment.execute({ environmentRef: options.environmentRef,
    intent: options.intent, budget: options.budget || {} });
  validateOutcome(outcome);
  return { outcomeId: randomUUID(), status: outcome.status, environmentRef: options.environmentRef,
    intentId: options.intent.intentId, observedStateRef: outcome.observedStateRef || null,
    evidenceRefs: outcome.evidenceRefs, metrics: outcome.metrics || {} };
}

function requiresApproval(options) { return options.intent.irreversible === true && options.approvalGranted !== true; }

function blockedOutcome(options) {
  return { outcomeId: randomUUID(), status: 'blocked', reason: 'motor-intent-approval-required',
    environmentRef: options.environmentRef, evidenceRefs: [] };
}

function validateOutcome(outcome) {
  if (!outcome || !['completed', 'failed', 'blocked'].includes(outcome.status)
    || !Array.isArray(outcome.evidenceRefs)) throw new TypeError('Embodied environment returned invalid motor outcome.');
  if (outcome.status === 'completed' && !outcome.evidenceRefs.length) {
    throw new TypeError('Completed motor outcome requires evidence references.');
  }
}

function validate(options) {
  if (!options?.environmentRef || !options.intent?.intentId || !options.intent.action
    || typeof options.environment?.execute !== 'function') throw new TypeError('Embodied motor adapter input invalid.');
}

module.exports = { execute, validate, validateOutcome };
