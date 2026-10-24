'use strict';

const crypto = require('node:crypto');
const { ARMS: REGISTERED_ARMS, INTERVENTION_TRIPLET } = require('../../../../backend/src/services/socialMetacognitionCampaignService');

const EXECUTABLE_ARMS = Object.freeze([]);
const REQUIRED_CAPTURE_FIELDS = Object.freeze([
  'verifiedInteractionReceipts', 'independentMemoryRows', 'persistedModelSnapshots', 'delayedDecisionReceipts',
]);

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function missingCapture(input) {
  const capture = input && input.capture;
  return REQUIRED_CAPTURE_FIELDS.filter((field) => !Array.isArray(capture && capture[field]) || capture[field].length === 0);
}

function comparisonHashes(input) {
  const seed = String(input.seed);
  const interventionPlan = ['genos-full', 'genos-social-memory-ablated', 'genos-social-memory-counterfactual'];
  return { eventsHash: digest({ caseId: 'socialworld-v2-06-case-01', seed, interventionPlan }),
    budgetHash: digest({ profile: 'socialworld-v2-06-budget-v1' }),
    permissionsHash: digest({ profile: 'socialworld-v2-06-permissions-v1' }) };
}

function reportFor(values) {
  const { input, reason, startedAt, durationMs } = values;
  const hashes = comparisonHashes(input);
  return {
    campaignId: 'socialworld-v2', scenario: 'V2-06', arm: input.arm, seed: input.seed,
    attempt: input.attempt, sourceCommit: input.sourceCommit || 'unknown', runtimeVersion: '3', model: null,
    configHash: digest({ caseId: 'socialworld-v2-06-case-01', seed: input.seed }),
    status: 'inconclusive', startedAt, durationMs,
    inputs: { captureProvided: Boolean(input.capture), comparison: hashes,
      registeredArms: REGISTERED_ARMS, interventionTriplet: INTERVENTION_TRIPLET },
    observed: { capturedEvidenceFields: REQUIRED_CAPTURE_FIELDS.filter((field) => Array.isArray(input.capture && input.capture[field])) },
    oracle: { recalculable: false, status: 'inconclusive', reason },
    evidenceRefs: [], violations: [], limitations: [reason],
  };
}

async function runScenario(input) {
  if (!REGISTERED_ARMS.includes(input.arm)) throw new Error(`Unknown V2-06 arm: ${input.arm}`);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const missing = missingCapture(input);
  const reason = missing.length
    ? `Missing runtime capture fields: ${missing.join(', ')}`
    : `V2-06 capture execution is not implemented for arm ${input.arm}.`;
  const evidence = { scenario: 'V2-06', arm: input.arm, seed: input.seed,
    captureAccepted: false, missingCaptureFields: missing,
    note: 'No synthetic memory, model or decision records are promoted to runtime evidence.' };
  return { report: reportFor({ input, reason, startedAt, durationMs: Date.now() - started }), evidence,
    comparison: comparisonHashes(input) };
}

module.exports = { REGISTERED_ARMS, EXECUTABLE_ARMS, INTERVENTION_TRIPLET, runScenario };
