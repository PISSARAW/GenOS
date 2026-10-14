'use strict';

const { randomUUID } = require('node:crypto');

async function execute(options) {
  validate(options);
  if (options.environment.ownerAgentId !== options.agentId) return blockedOutcome(options, 'motor-actuator-owner-mismatch');
  if (requiresApproval(options)) return blockedOutcome(options, 'motor-intent-approval-required');
  const request = { agentId: options.agentId, runId: options.runId, actuatorId: options.environment.actuatorId,
    toolName: options.environment.toolName, environmentRef: options.environmentRef, intent: options.intent };
  const authorized = options.authority
    ? await options.authority.assert(request)
    : await require('./motorMissionAuthority').assert(options.db, request);
  if (authorized !== true) return blockedOutcome(options, 'motor-actuator-authority-denied');
  const outcome = await options.environment.execute({ environmentRef: options.environmentRef,
    intent: options.intent, budget: options.budget || {}, agentId: options.agentId });
  validateOutcome(outcome);
  return { outcomeId: randomUUID(), status: outcome.status, agentId: options.agentId,
    actuatorId: options.environment.actuatorId, environmentRef: options.environmentRef,
    intentId: options.intent.intentId, observedStateRef: outcome.observedStateRef || null,
    evidenceRefs: outcome.evidenceRefs, metrics: outcome.metrics || {}, result: outcome.result };
}

function requiresApproval(options) { return options.intent.irreversible === true && options.approvalGranted !== true; }

function blockedOutcome(options, reason) {
  return { outcomeId: randomUUID(), status: 'blocked', reason, agentId: options.agentId,
    actuatorId: options.environment.actuatorId, environmentRef: options.environmentRef, evidenceRefs: [] };
}

function validateOutcome(outcome) {
  if (!outcome || !['completed', 'failed', 'blocked'].includes(outcome.status)
    || !Array.isArray(outcome.evidenceRefs)) throw new TypeError('Embodied environment returned invalid motor outcome.');
  if (outcome.status === 'completed' && !outcome.evidenceRefs.length) {
    throw new TypeError('Completed motor outcome requires evidence references.');
  }
}

function validate(options) {
  if (!options?.agentId || !options.environmentRef || !options.intent?.intentId || !options.intent.action
    || !validEnvironment(options.environment) || !hasAuthoritySource(options)) {
    throw new TypeError('Embodied motor adapter input invalid.');
  }
}

function validEnvironment(environment) {
  return Boolean(environment?.ownerAgentId && environment.actuatorId && environment.toolName
    && typeof environment.execute === 'function');
}

function hasAuthoritySource(options) {
  return typeof options.authority?.assert === 'function' || typeof options.db?.get === 'function';
}

module.exports = { execute, validate, validateOutcome };
