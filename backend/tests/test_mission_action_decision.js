'use strict';

const assert = require('node:assert/strict');
const { decideMissionAction } = require('../src/services/missionActionDecisionService');
const { SCHEMA, STATUSES } = require('../src/services/missionOutcomeContract');

const contract = { schema: SCHEMA, goal: 'Deliver a verified answer',
  obligations: [{ id: 'answer', statement: 'The answer is correct' }], statuses: [...STATUSES] };
const policy = { weights: { tokens: 1, usd: 0, latencyMs: 0 } };
const budget = { tokens: 100, usd: 1, latencyMs: 1000 };
const cost = (tokens) => ({ execution: { tokens, usd: 0.01, latencyMs: 10 },
  verification: { tokens: 5, usd: 0.01, latencyMs: 10 }, maxRetries: 0 });
const receipt = (minimum) => ({ probabilityVerified: { min: minimum, max: minimum + 0.05 },
  evidenceRef: 'holdout:1' });
const action = (id, kind, options) => ({ id, kind, covers: ['answer'],
  cost: cost(options.tokens), calibrationReceipt: receipt(options.probability) });
const trusted = { verifyAuthority: () => true,
  verifyCalibration: (entry) => entry.evidenceRef === 'holdout:1',
  verifyOutcome: (outcome) => outcome.trusted === true,
  verifyEvidence: (ref) => ref !== 'proof:missing' };
const base = { missionId: 'mission-1', contract, budget, policy };

function testsTradeoffAndCompleteCost() {
  const retryHeavy = action('retry-heavy', 'tool', { tokens: 1, probability: 0.9 });
  retryHeavy.cost.retry = { tokens: 60, usd: 0, latencyMs: 0 };
  retryHeavy.cost.maxRetries = 1;
  const actions = [action('cheap', 'procedure', { tokens: 10, probability: 0.7 }),
    action('expensive', 'large_model', { tokens: 65, probability: 0.75 }), retryHeavy];
  const result = decideMissionAction({ ...base, actions }, trusted);
  assert.equal(result.status, 'shadow');
  assert.equal(result.selectedId, 'cheap');
  assert.equal(result.executable, false);
  assert.equal(result.alternatives.find((item) => item.id === 'cheap').quote.total.tokens.max, 15);
  assert.equal(result.alternatives.find((item) => item.id === 'retry-heavy').quote.total.tokens.max, 66);
  assert.equal(result.journal.alternatives.length, 5);
}

function testsGatesBeforeValue() {
  const unaffordable = action('unaffordable', 'delegation', { tokens: 100, probability: 0.99 });
  const uncalibrated = action('uncalibrated', 'small_model', { tokens: 10, probability: 0.99 });
  uncalibrated.calibrationReceipt.evidenceRef = 'untrusted';
  const missingProof = action('missing-proof', 'tool', { tokens: 10, probability: 0.99 });
  missingProof.requiredEvidenceRefs = ['proof:missing'];
  const incomplete = action('incomplete', 'verification', { tokens: 1, probability: 0.99 });
  delete incomplete.cost.maxRetries;
  const result = decideMissionAction({ ...base,
    actions: [unaffordable, uncalibrated, missingProof, incomplete] }, trusted);
  assert.equal(result.status, 'need_evidence');
  assert.equal(result.selectedId, null);
  assert.deepEqual(result.alternatives.slice(2).map((item) => item.reason),
    ['budget_exceeded', 'calibration_unverified', 'evidence_unverified', 'cost_incomplete']);
  assert.equal(decideMissionAction({ ...base, actions: [action('a', 'tool',
    { tokens: 5, probability: 0.8 })] })
    .alternatives[2].reason, 'authority_unverified');
}

function testsTerminalOutcomes() {
  const actions = [action('model', 'large_model', { tokens: 10, probability: 0.9 })];
  const untrusted = decideMissionAction({ ...base, actions,
    outcome: { status: 'verified' } }, trusted);
  assert.equal(untrusted.selectedId, 'model');
  const verified = decideMissionAction({ ...base, actions,
    outcome: { status: 'verified', trusted: true } }, trusted);
  assert.equal(verified.selectedId, 'none');
  assert.equal(verified.alternatives[2].reason, 'mission_already_verified');
  const abstained = decideMissionAction({ ...base, actions: [],
    outcome: { status: 'abstained', trusted: true } }, trusted);
  assert.equal(abstained.selectedId, 'abstain');
}

function testsValidation() {
  assert.throws(() => decideMissionAction({ ...base, budget: { ...budget, tokens: -1 },
    actions: [] }), /budget/);
  assert.throws(() => decideMissionAction({ ...base, actions: [],
    policy: { weights: { tokens: 0.2, usd: 0.2, latencyMs: 0.2 } } }), /sum to one/);
  assert.throws(() => decideMissionAction({ ...base, actions: [
    action('same', 'tool', { tokens: 1, probability: 0.5 }),
    action('same', 'tool', { tokens: 1, probability: 0.5 })] }), /unique/);
}

testsTradeoffAndCompleteCost();
testsGatesBeforeValue();
testsTerminalOutcomes();
testsValidation();
console.log('Mission action decision tests passed.');
