'use strict';

const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.GENOS_SCHEMA_MAINTENANCE = '0';
process.env.GENOS_DB_PATH = ':memory:';

const { getDatabase, closeDatabase } = require('../src/db');
const { executeLiveCycle } = require('../src/services/communication/liveCycleExecution');
const metrics = require('../src/services/communication/communicationMetricsService');

const intent = { senderAgentId: 'comm-orch', purpose: 'coordinate', domain: 'mission',
  semanticRefs: ['mission:communication:blocked'], artifactRefs: ['artifact:1'] };
const decision = { action: 'SIGNAL', recipients: ['comm-worker'], grounding: 'none',
  ttlMs: 60000, meta: { receptorTopic: 'checkpoint' } };

async function setup() {
  const db = await getDatabase(':memory:');
  await db.run("INSERT INTO organizations (id, name) VALUES ('comm-org', 'Communication Org')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('comm-project', 'comm-org', 'Communication Project')");
  await db.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
    VALUES ('comm-space', 'Communication Space', '/tmp/comm', 'comm-org', 'comm-project')`);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES ('comm-orch', 'Sender', 'orchestrator', 'idle', 'orchestrator', 'comm-space')`);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id)
    VALUES ('comm-worker', 'Worker', 'worker', 'running', 'worker', 'comm-space', 'comm-orch')`);
  return db;
}

function reportedTransport() {
  return { deliver: async (input) => ({ published: true, signalId: input.envelope.messageId,
    acknowledgements: [], modelCallsComplete: true, modelCalls: ['baseline-sender', 'baseline-worker'],
    usageReceipts: [
      { apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
        cycleId: input.cycleId, participantAgentId: 'comm-orch', phase: 'generation',
        responseId: 'baseline-sender', inputTokens: 10, outputTokens: 5 },
      { apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
        cycleId: input.cycleId, participantAgentId: 'comm-worker', phase: 'control',
        responseId: 'baseline-worker', inputTokens: 3, outputTokens: 2 }
    ] }) };
}

async function testComparison(db) {
  const baseline = await executeLiveCycle({ db, decision, intent,
    opts: { cycleId: 'baseline-cycle', transport: reportedTransport() } });
  assert.equal(baseline.tokensUsed, 20);
  assert.equal(baseline.tokenCoverage, 'complete');
  assert.equal(baseline.usageProvenance, 'adapter_reported');
  const native = await executeLiveCycle({ db, decision, intent,
    opts: { cycleId: 'native-cycle', baselineCycle: baseline } });
  const row = await db.get('SELECT signal_type FROM signal_blobs WHERE signal_id = ?',
    [native.signalId]);
  const deliveries = await db.all('SELECT subscriber_agent_id FROM signal_deliveries WHERE signal_id = ?',
    [native.signalId]);
  assert.equal(row?.signal_type, 'ligand');
  assert.deepEqual(deliveries.map((item) => item.subscriber_agent_id), ['comm-worker']);
  assert.equal(native.published, true);
  assert.equal(native.grounding.source, 'database_observed');
  assert.equal(native.tokensUsed, 0);
  assert.equal(native.usageProvenance, 'native_transport_no_model_call');
  assert.equal(native.comparison.status, 'reported_delta');
  assert.equal(native.comparison.deltaTokens, -20);
  assert.equal(native.comparison.savingsVerified, false);
  assert.equal(metrics.getMetrics().tokensMeasured, 2);
  assert.equal(metrics.getMetrics().tokensAvoided, 0);
  assert.deepEqual(native.comparison.perAgent.map((entry) =>
    [entry.agentId, entry.generationTokens, entry.controlTokens]),
  [['comm-orch', -15, 0], ['comm-worker', 0, -5]]);
}

async function testIncomplete(db) {
  const partial = await executeLiveCycle({ db, decision, intent,
    opts: { cycleId: 'partial-cycle', transport: { deliver: async (input) => ({
      published: true, signalId: input.envelope.messageId, acknowledgements: [],
      usageReceipts: [{ apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
        cycleId: input.cycleId, participantAgentId: 'comm-orch', phase: 'generation',
        responseId: 'partial-response', inputTokens: 1, outputTokens: 1 }] }) } } });
  const candidate = await executeLiveCycle({ db, decision, intent,
    opts: { cycleId: 'native-incomplete', baselineCycle: partial } });
  assert.equal(candidate.comparison.status, 'incomparable');
  await assert.rejects(executeLiveCycle({ db, decision, intent,
    opts: { usageReceipt: { responseId: 'injected' } } }),
  { code: 'COMMUNICATION_USAGE_RECEIPT_INVALID' });
}

async function main() {
  metrics.resetMetrics();
  const db = await setup();
  try {
    await testComparison(db);
    await testIncomplete(db);
  } finally {
    await closeDatabase();
  }
  console.log('Native SIGNAL delivery and paired reported token comparison passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
