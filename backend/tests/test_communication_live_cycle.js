'use strict';

const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.GENOS_SCHEMA_MAINTENANCE = '0';
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { initializeSchema } = require('../src/db/schema');
const { migrateRelationCommunicationProfile } = require('../src/db/migrations/migrateRelationCommunicationProfile');
const { executeLiveCycle } = require('../src/services/communication/liveCycleExecution');
const { runCycle } = require('../src/services/communication/runCycleDriver');
const { setMode, getMode } = require('../src/services/communication/communicationPolicyEngine');
const metrics = require('../src/services/communication/communicationMetricsService');

const intent = { senderAgentId: 'alice', semanticRefs: ['fact:1'], payload: { finding: true } };

function decision(grounding = 'semantic_ack') {
  return { action: 'SIGNAL', recipients: ['bob'], grounding, ttlMs: 60000,
    meta: { cost: 0.2 } };
}

function adapter(resultFor) {
  return { deliver: async (input) => resultFor(input) };
}

async function testPendingIsNotGrounded() {
  let sent = null;
  const transport = adapter((input) => {
    sent = input;
    return { published: true, signalId: input.envelope.messageId,
      acknowledgements: [{ recipientAgentId: 'bob', groundingLevel: 'none', status: 'pending' }] };
  });
  const result = await executeLiveCycle({ decision: decision(), intent,
    opts: { cycleId: 'cycle-1', transport } });
  assert.equal(result.executed, true);
  assert.equal(result.simulated, false);
  assert.equal(result.grounding.satisfied, false);
  assert.equal(result.actionTaken, null);
  assert.equal(result.recipientKnew, null);
  assert.equal(result.tokensUsed, null);
  assert.equal(sent.cycleId, 'cycle-1');
  assert.deepEqual(sent.envelope.recipientAgentIds, ['bob']);
}

async function testGroundingAndUsageAreCorrelated() {
  const transport = adapter((input) => ({ published: true,
    signalId: input.envelope.messageId,
    acknowledgements: [{ recipientAgentId: 'bob', groundingLevel: 'semantic_ack', status: 'seen' }],
    usageReceipt: { apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
      cycleId: input.cycleId, responseId: 'provider-1', inputTokens: 17, outputTokens: 5 }
  }));
  const result = await executeLiveCycle({ decision: decision(), intent,
    opts: { cycleId: 'cycle-2', transport } });
  assert.equal(result.grounding.satisfied, true);
  assert.equal(result.tokensUsed, 22);
  assert.equal(result.tokensMeasured, true);
  assert.equal(result.usageReceiptId, 'provider-1');
  assert.equal(metrics.getMetrics().tokensInput, 17);
  assert.equal(metrics.getMetrics().tokensOutput, 5);
}

async function testMismatchedReceiptsFailClosed() {
  const wrongUsage = adapter((input) => ({ published: true,
    signalId: input.envelope.messageId, acknowledgements: [],
    usageReceipt: { apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
      cycleId: 'other-cycle', responseId: 'provider-2', inputTokens: 3, outputTokens: 2 }
  }));
  await assert.rejects(executeLiveCycle({ decision: decision(), intent,
    opts: { cycleId: 'cycle-3', transport: wrongUsage } }),
  { code: 'COMMUNICATION_USAGE_RECEIPT_INVALID' });
  const wrongDelivery = adapter((input) => ({ published: true,
    signalId: input.envelope.messageId,
    acknowledgements: [{ recipientAgentId: 'mallory', groundingLevel: 'verified_ack' }] }));
  await assert.rejects(executeLiveCycle({ decision: decision(), intent,
    opts: { transport: wrongDelivery } }), /unexpected or duplicate recipient/);
}

async function testUnpublishedCannotClaimGrounding() {
  const transport = adapter(() => ({ published: false, signalId: null,
    acknowledgements: [] }));
  const result = await executeLiveCycle({ decision: decision(), intent,
    opts: { transport } });
  assert.equal(result.executed, false);
  assert.equal(result.grounding.satisfied, false);
}

async function testShadowAndMissingAdapter() {
  const oldMode = getMode();
  let calls = 0;
  try {
    setMode('shadow');
    const result = await executeLiveCycle({ decision: decision(), intent,
      opts: { transport: adapter(() => { calls += 1; }) } });
    assert.equal(result.reason, 'SHADOW_MODE');
    assert.equal(calls, 0);
  } finally {
    setMode(oldMode);
  }
  await assert.rejects(executeLiveCycle({ decision: { ...decision(), action: 'DIALOGUE' },
    intent }), /No live communication transport/);
  await assert.rejects(runCycle({ intent }), /executionMode must be live or simulate/);
}

async function ensureRelationCreatedAt(db) {
  const columns = await db.all('PRAGMA table_info(agent_relations)');
  if (!columns.some((column) => column.name === 'created_at')) {
    await db.exec('ALTER TABLE agent_relations ADD COLUMN created_at TEXT');
  }
}

async function testRunCycleLiveIntegration() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await initializeSchema(db);
    await migrateRelationCommunicationProfile(db);
    await ensureRelationCreatedAt(db);
    await db.run(`INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier)
      VALUES ('alice', 'Alice', 'orchestrator', 'idle', 100, 'Pro')`);
    await db.run(`INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier)
      VALUES ('bob', 'Bob', 'worker', 'idle', 100, 'Flash')`);
    await db.run(`INSERT INTO agent_expertise (agent_id, domain, competence)
      VALUES ('bob', 'planning', 0.9)`);
    const result = await runCycle({ db, intent: { ...intent, purpose: 'request',
      risk: 'low', urgency: 1, domain: 'planning', requestedAudience: ['bob'],
      requiresAction: true }, opts: { executionMode: 'live', cycleId: 'cycle-integrated',
      coefficients: { tokenInPer1k: 0, tokenOutPer1k: 0, cognitiveWake: 0,
        fanoutPerRecipient: 0, contaminationPerUnit: 0, disclosurePerUnit: 0 },
      transport: adapter((input) => ({ published: true,
        signalId: input.envelope.messageId, acknowledgements: [] })) } });
    assert.equal(result.outcome.simulated, false);
    assert.equal(result.outcome.published, true);
    assert.equal(result.outcome.cycleId, 'cycle-integrated');
    assert.equal(result.receipt.outcome.simulated, false);
    assert.equal(result.receipt.outcome.grounding.source, 'adapter_reported');
    assert.equal(result.outcome.actionTaken, null);
  } finally {
    await db.close();
  }
}

async function main() {
  metrics.resetMetrics();
  await testPendingIsNotGrounded();
  await testGroundingAndUsageAreCorrelated();
  await testMismatchedReceiptsFailClosed();
  await testUnpublishedCannotClaimGrounding();
  await testShadowAndMissingAdapter();
  await testRunCycleLiveIntegration();
  console.log('Live communication cycles preserve publication, grounding and token provenance.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
