'use strict';

const outcomeValidation = require('./morphogenesis/learning/outcomeEvidenceValidation');
const { digest } = require('./biologicalIntegrity');

const FAILURE_EVENTS = new Set(['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED']);
const NEGATIVE_OUTCOME_SCHEMA = 'genos.terminal-negative-outcome/v1';

function terminalEventBase(event) {
  const payload = { ...(event?.payload || {}) };
  for (const field of ['qualityEvidence', 'qualityEvidenceStatus', 'negativeOutcomeEvidence',
    'negativeOutcomeEvidenceStatus']) delete payload[field];
  return { ...event, payload };
}

function terminalEventHash(event) {
  return digest(terminalEventBase(event));
}

function validateNegativeOutcome(input) {
  const { event, evidence, binding } = input;
  const context = evidence?.learningContext;
  return FAILURE_EVENTS.has(event?.eventType) && evidence?.success === false
    && Number(evidence.value) === 0 && context?.schema === NEGATIVE_OUTCOME_SCHEMA
    && context.eventType === event.eventType && context.terminalEventHash === terminalEventHash(event)
    && outcomeValidation.validate(evidence, binding);
}

module.exports = { FAILURE_EVENTS, NEGATIVE_OUTCOME_SCHEMA, terminalEventBase, terminalEventHash,
  validateNegativeOutcome };
