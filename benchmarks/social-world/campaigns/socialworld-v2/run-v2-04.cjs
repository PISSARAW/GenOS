'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateReport } = require('./validate-report.cjs');

const REGISTERED_ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory']);
const EXECUTABLE_ARMS = Object.freeze([]);
const SCENARIO = 'V2-04';
const DOMAIN = 'navigation';
const PROTOCOL = Object.freeze({ version: 1, expectedOutcomes: 2, rejectedReceiptClasses: 3,
  subsequentDecision: 'recipient-routing' });

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function comparisonHashes(seed) {
  return { eventsHash: digest(JSON.stringify({ scenario: SCENARIO, seed, protocol: PROTOCOL })),
    budgetHash: digest(JSON.stringify({ acceptedOutcomes: PROTOCOL.expectedOutcomes,
      rejectedReceiptClasses: PROTOCOL.rejectedReceiptClasses })),
    permissionsHash: digest(JSON.stringify({ verifierPolicy: 'externally-pinned-key-required',
      actorAuthorization: 'allowlist-required', domain: DOMAIN })) };
}

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('scenario input must be an object');
  validateTreatment(input);
  validateTiming(input);
  validateExecutionContext(input);
}

function validateTreatment(input) {
  if (!REGISTERED_ARMS.includes(input.arm)) throw new Error(`Unknown V2-04 arm: ${input.arm}`);
  if (typeof input.seed !== 'string' || !input.seed.trim()) throw new Error('seed is required');
}

function validateTiming(input) {
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error('attempt must be a positive integer');
}

function validateExecutionContext(input) {
  if (typeof input.sourceCommit !== 'string' || !input.sourceCommit.trim()) throw new Error('sourceCommit is required');
  if (typeof input.outputDirectory !== 'string' || !path.isAbsolute(input.outputDirectory)) {
    throw new Error('outputDirectory must be absolute');
  }
}

function unavailableReason(arm) {
  if (arm === 'genos-full') {
    return 'No externally pinned verifier key and signed runtime receipt bundle are configured.';
  }
  return `No V2-04 runtime adapter exists for ${arm}; it was not mapped to another arm.`;
}

function safeKey(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function makeEvidence(input, reason) {
  return { campaignId: 'socialworld-v2', scenario: SCENARIO, arm: input.arm,
    seed: input.seed, attempt: input.attempt, runnerExecuted: false,
    authenticatedReceiptCount: 0, persistedOutcomeCount: 0,
    subsequentDecisionObserved: false, reason,
    missingPrerequisites: ['externally pinned verifier public key', 'authorized verifier identity',
      'signed receipts from an independent event source'] };
}

function makeReport(context) {
  const { input, reason, evidenceName, startedAt, durationMs } = context;
  return { campaignId: 'socialworld-v2', scenario: SCENARIO, arm: input.arm, seed: input.seed,
    attempt: input.attempt, sourceCommit: input.sourceCommit, runtimeVersion: '3', model: null,
    configHash: digest(JSON.stringify({ scenario: SCENARIO, arm: input.arm, seed: input.seed,
      protocol: PROTOCOL })), status: 'inconclusive', startedAt, durationMs,
    inputs: { domain: DOMAIN, comparison: comparisonHashes(input.seed), protocol: PROTOCOL },
    observed: { runnerExecuted: false, authenticatedReceiptCount: 0,
      persistedOutcomeCount: 0, subsequentDecisionObserved: false },
    oracle: { recalculable: false, reason }, evidenceRefs: [evidenceName],
    violations: [], limitations: [reason] };
}

async function runScenario(input) {
  validateInput(input);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const reason = unavailableReason(input.arm);
  const evidence = makeEvidence(input, reason);
  fs.mkdirSync(input.outputDirectory, { recursive: true });
  const evidenceName = `${SCENARIO}-${input.arm}-${safeKey(input.seed)}-attempt-${input.attempt}.evidence.json`;
  const evidencePath = path.join(input.outputDirectory, evidenceName);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  const report = makeReport({ input, reason, evidenceName, startedAt, durationMs: Date.now() - started });
  const reportPath = path.join(input.outputDirectory, `${SCENARIO}-${safeKey(input.seed)}-${input.arm}-report.json`);
  const errors = validateReport(report, reportPath, path.resolve(__dirname, '../../../..'));
  if (errors.length) throw new Error(`generated V2-04 report failed validation: ${errors.join('; ')}`);
  return { report, evidence };
}

module.exports = { runScenario, REGISTERED_ARMS, EXECUTABLE_ARMS, comparisonHashes };
