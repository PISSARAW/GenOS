'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { compileEvidenceDelta, decodeEvidenceDelta } = require('../src/services/agentEvidence/continuationContextCompiler');
const { buildContinuationContext } = require('../bin/agent-runtime-prompt.cjs');
const bandit = require('../src/services/routingBanditService');
const { selectHistoricalMemories } = require('../src/services/agentMemoryPrompt');
const { recordModelUsage } = require('../src/services/modelRouteRunner');
const { buildStreamResponse } = require('../src/services/modelProviderRequest');

function memoryDb() {
  const values = new Map();
  return {
    get: async (sql, scope, key) => values.has(`${scope}|${key}`)
      ? { payload_json: values.get(`${scope}|${key}`) } : null,
    all: async () => [],
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (!String(sql).includes('adaptive_state_events')) values.set(`${scope}|${key}`, payload);
    }
  };
}

function verifyEvidencePreservation() {
  const claims = Array.from({ length: 80 }, (_, index) => ({
    statement: `Claim ${index}: ${'measured '.repeat(14)}`,
    evidence: [`source:${index}`, `receipt:${index}`], status: 'provisional'
  }));
  claims[79].statement += ' CRITICAL_CONTRADICTION_AT_END';
  const report = { claims, uncertainties: ['The last claim is contradicted.'], outcome: 'unresolved' };
  const compiled = compileEvidenceDelta(report);
  assert.equal(compiled.encoding, 'columnar-claims-v1');
  assert.ok(compiled.contextChars < compiled.sourceChars);
  assert.deepEqual(decodeEvidenceDelta(compiled), report);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(decodeEvidenceDelta(compiled))).digest('hex'),
    compiled.sourceSha256);
  const prompt = buildContinuationContext(null, report, 2000);
  assert.ok(prompt.includes('CRITICAL_CONTRADICTION_AT_END'));
  assert.ok(prompt.includes('source:79'));
  assert.ok(prompt.includes(compiled.sourceSha256));
  assert.ok(JSON.stringify(report).length > 8000);
}

function verifyNegativeMemoryPriority() {
  const memories = {
    pitfalls: [{ content: 'Previous attempt failed because the source had been retracted.' }],
    goldenPaths: [], episodes: [],
    experiences: [{ content: 'Useful but optional observation. '.repeat(15) }]
  };
  const selected = selectHistoricalMemories(memories, { historicalMemoryTokenBudget: 80 });
  assert.equal(selected.pitfalls.length, 1);
  assert.equal(selected.experiences.length, 0);
  assert.equal(selectHistoricalMemories(memories, { historicalMemoryTokenBudget: 0 }).pitfalls.length, 0);
}

async function verifyNoTransportLabels() {
  const db = memoryDb();
  assert.equal(await bandit.observe(db, { routeUri: 'a://m', success: true }), null);
  assert.equal(bandit.parseUsageRow({ id: 'transport', metadata_json: JSON.stringify({ model: 'a://m', transportSuccess: true }) }), null);
  const cold = await bandit.chooseWithGuardrails(db, ['a://m', 'b://m'], { canaryRate: 1, minPulls: 1 });
  assert.equal(cold.mode, 'policy');
  const verification = { status: 'verified', success: false, evidenceRef: 'gate:independent-1' };
  assert.equal(await bandit.observe(db, { routeUri: 'a://m', success: true, verification }), null);
  const learned = await bandit.observe(db, { routeUri: 'a://m', success: false, verification });
  assert.equal(learned.pulls, 1);
  const holdout = await bandit.evaluateLoggedHoldout({ all: async () => Array.from({ length: 30 }, (_, index) => ({
    id: `transport-${index}`, metadata_json: JSON.stringify({ model: 'a://m', transportSuccess: true })
  })) });
  assert.equal(holdout.status, 'insufficient_data');
}

async function verifyUsageProvenance() {
  const streamed = buildStreamResponse({ text: 'answer', usage: { prompt_tokens: 12, completion_tokens: 4 },
    responseId: 'response-1' }, { options: { prompt: 'question' }, provider: 'openai', modelName: 'm' });
  assert.equal(streamed.tokenUsageMeasured, true);
  assert.equal(streamed.inputTokens, 12);
  assert.equal(streamed.outputTokens, 4);
  assert.equal(buildStreamResponse({ text: 'answer', usage: {} },
    { options: { prompt: 'question' }, provider: 'openai', modelName: 'm' }).tokenUsageMeasured, false);
  let receipt;
  const db = { run: async (...args) => { receipt = JSON.parse(args[8]); } };
  await recordModelUsage(db, { organizationId: 'org', projectId: 'project',
    executionRunId: 'run-1', agentId: 'worker-1' }, {
    model: 'test://m', requestedModel: 'test://m', servedModel: 'served-m',
    routeAttemptId: 'attempt-1', inputTokens: 120, outputTokens: 30,
    tokenUsageMeasured: false, costUsd: 0.01, latencyMs: 5, success: true
  });
  assert.equal(receipt.tokenUsageSource, 'estimate');
  assert.equal(receipt.executionRunId, 'run-1');
  assert.equal(receipt.routeAttemptId, 'attempt-1');
  assert.equal(receipt.transportSuccess, true);
  assert.equal(receipt.verification, undefined);
}

async function run() {
  verifyEvidencePreservation();
  verifyNegativeMemoryPriority();
  await verifyNoTransportLabels();
  await verifyUsageProvenance();
  console.log('Verified token economy regressions passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
