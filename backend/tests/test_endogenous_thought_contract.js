'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contracts = require('../src/services/versionedContractService');
const protocolService = require('../src/services/endogenousThoughtProtocolService');

const ROOT = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function validQuestion(overrides = {}) {
  return {
    questionId: 'ett_question_1', episodeId: 'ett_episode_1', domain: 'runtime',
    text: 'Pourquoi la prédiction diverge-t-elle ?', hypothesis: 'Le signal observé est périmé.',
    falsifier: 'Une observation fraîche produit la même divergence.', method: 'Comparer deux observations horodatées.',
    expectedEvidence: ['observation fraîche', 'écart de prédiction mesuré'], expectedInformationGain: 0.7,
    estimatedCost: { tokens: 500, usd: 0.01, seconds: 10 }, risk: 0.1,
    sourceRefs: ['observation:1'], createdAt: '2026-10-18T10:00:00.000Z', ...overrides
  };
}

function validEpisode(overrides = {}) {
  return {
    transitionId: 'ett_transition_1', episodeId: 'ett_episode_1', agentId: 'agent_1', projectId: 'project_1',
    mandateRef: 'mandate:1', fromState: null, toState: 'DETECTED', triggerRef: 'observation:1',
    questionRef: null, decisionRef: null, taskRef: null, jobRef: null,
    budget: { tokens: 1000, usd: 0.05, seconds: 30 }, evidenceRefs: [], stopReason: null,
    occurredAt: '2026-10-18T10:00:00.000Z', previousReceiptId: null, ...overrides
  };
}

function invalid(type, payload, code) {
  const result = contracts.validateContract(type, payload);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === code), `${type} should report ${code}`);
}

const question = validQuestion();
const questionReceipt = contracts.createReceipt('EndogenousQuestion', question, { runId: 'ett_run_1' });
assert.equal(contracts.readReceipt(questionReceipt).valid, true);
invalid('EndogenousQuestion', validQuestion({ sourceRefs: [] }), 'INVALID_PROVENANCE');
invalid('EndogenousQuestion', validQuestion({ expectedInformationGain: 1.2 }), 'INVALID_SCORE');
invalid('EndogenousQuestion', { ...question, unplannedField: true }, 'UNKNOWN_FIELD');

const detected = validEpisode();
assert.equal(contracts.validateContract('EndogenousThoughtEpisode', detected).valid, true);
const questioned = validEpisode({ fromState: 'DETECTED', toState: 'QUESTIONED',
  questionRef: questionReceipt.receiptId, previousReceiptId: 'rcpt_detected' });
assert.equal(contracts.validateContract('EndogenousThoughtEpisode', questioned).valid, true);
const verified = validEpisode({ fromState: 'RUNNING', toState: 'VERIFIED',
  questionRef: questionReceipt.receiptId, decisionRef: 'decision:1', taskRef: 'task:1', jobRef: 'job:1',
  evidenceRefs: ['evidence:verified:1'], previousReceiptId: 'rcpt_running' });
assert.equal(contracts.validateContract('EndogenousThoughtEpisode', verified).valid, true);
const stopped = validEpisode({ fromState: 'LEARNED', toState: 'STOPPED',
  questionRef: questionReceipt.receiptId, decisionRef: 'decision:1', taskRef: 'task:1', jobRef: 'job:1',
  evidenceRefs: ['evidence:verified:1'], stopReason: 'objectif-vérifié', previousReceiptId: 'rcpt_learned' });
assert.equal(contracts.validateContract('EndogenousThoughtEpisode', stopped).valid, true);

invalid('EndogenousThoughtEpisode', validEpisode({ fromState: 'DETECTED', toState: 'VERIFIED',
  previousReceiptId: 'rcpt_detected' }), 'INVALID_TRANSITION');
invalid('EndogenousThoughtEpisode', { ...verified, evidenceRefs: [] }, 'MISSING_EVIDENCE');
invalid('EndogenousThoughtEpisode', { ...stopped, stopReason: null }, 'INVALID_STOP');
invalid('EndogenousThoughtEpisode', { ...questioned, previousReceiptId: null }, 'INVALID_LINEAGE');
invalid('EndogenousThoughtEpisode', { ...questioned, questionRef: null }, 'MISSING_REFERENCE');

const metrics = readJson('shared/endogenousThoughtMetrics.v1.json');
const protocol = readJson('benchmarks/endogenous-thought/protocol-v1.json');
const metricIds = new Set(metrics.metrics.map((metric) => metric.id));
assert.equal(protocolService.validateMetricSet(metrics).valid, true);
assert.equal(protocolService.validateProtocol(protocol, metrics).valid, true);
assert.equal(metrics.promotionEligible, false);
assert.equal(metricIds.size, metrics.metrics.length);
assert.equal(metricIds.has(metrics.primaryMetricId), true);
assert.equal(protocol.primaryMetricId, metrics.primaryMetricId);
assert.equal(protocol.promotionDecision, null);
assert.equal(protocol.analysisPlan.reservedCorpusUsedForTuning, false);
assert.equal(protocol.evidencePolicy.modelOutputIsEvidence, false);
assert.equal(protocol.evidencePolicy.scientificPromotionAllowed, false);
assert.deepEqual(protocol.safetyBoundary, {
  authorityAblated: false, sandboxAblated: false,
  budgetEnforcementAblated: false, evidenceGateAblated: false
});
assert.equal(new Set(protocol.conditions).size, protocol.conditions.length);
assert.ok(protocol.conditions.includes('planned_control'));
assert.ok(protocol.conditions.includes('shev_initiative_ablated'));
assert.ok(protocol.corpus.developmentSeeds.every((seed) => !protocol.corpus.reservedSeeds.includes(seed)));
assert.equal(protocolService.validateProtocol({ ...protocol,
  safetyBoundary: { ...protocol.safetyBoundary, authorityAblated: true } }, metrics).valid, false);
assert.equal(protocolService.validateProtocol({ ...protocol,
  corpus: { ...protocol.corpus, reservedSeeds: [...protocol.corpus.developmentSeeds] } }, metrics).valid, false);
assert.equal(protocolService.validateMetricSet({ ...metrics, promotionEligible: true }).valid, false);

console.log('ETT v1 contracts, transitions, protocol and non-promoting metrics passed.');
