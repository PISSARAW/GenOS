'use strict';

const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.GENOS_SCHEMA_MAINTENANCE = '0';
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { initializeSchema } = require('../src/db/schema');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const bridge = require('../src/services/communication/missionCheckpointBridge');
const metrics = require('../src/services/communication/communicationMetricsService');

async function teamDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await initializeSchema(db);
  await db.run(`INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier)
    VALUES ('alice', 'Alice', 'orchestrator', 'idle', 100, 'Pro')`);
  await db.run(`INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier)
    VALUES ('bob', 'Bob', 'worker', 'idle', 100, 'Flash')`);
  await db.run("INSERT INTO signal_subscriptions (subscriber_agent_id, topic) VALUES ('alice', 'team')");
  await db.run("INSERT INTO signal_subscriptions (subscriber_agent_id, topic) VALUES ('bob', 'team')");
  return db;
}

function usage(input) {
  return { apiVersion: 'genos.communication-usage/v1', source: 'model-provider',
    cycleId: input.cycleId, participantAgentId: input.agentId, phase: input.phase,
    responseId: input.responseId, inputTokens: input.counts[0], outputTokens: input.counts[1] };
}

function transportFor(level) {
  return { deliver: async (input) => ({ published: true,
    signalId: input.envelope.messageId,
    acknowledgements: level ? [{ recipientAgentId: 'bob', groundingLevel: level,
      status: 'acked', evidenceHash: 'sha256:verified' }] : [],
    usageReceipts: [usage({ cycleId: input.cycleId, agentId: 'alice', phase: 'generation',
      responseId: `sender-${input.cycleId}`, counts: [11, 4] }),
    usage({ cycleId: input.cycleId, agentId: 'bob', phase: 'control',
      responseId: `receiver-${input.cycleId}`, counts: [3, 1] })] }) };
}

async function runBlocker(db, cycleId, level) {
  return checkpoint.evaluateCheckpoint({ db, agentId: 'alice',
    checkpoint: 'BLOCKER_DETECTED', evidence: { domain: 'mission',
      semanticRefs: [`mission:${cycleId}:blocked`] },
    communication: { cycleId, transport: transportFor(level) } });
}

async function main() {
  metrics.resetMetrics();
  const db = await teamDatabase();
  try {
    const pending = await runBlocker(db, 'team-pending', null);
    assert.equal(pending.decision.action, 'SIGNAL');
    assert.equal(pending.executed.published, true);
    assert.equal(pending.executed.grounding.satisfied, false);
    assert.equal(pending.executed.tokensUsed, 19);
    assert.equal(pending.executed.tokenCoverage, 'reported_lower_bound');
    assert.equal(pending.outcome.executionConfirmed, true);
    assert.equal(pending.outcome.deliveryConfirmed, true);
    assert.equal(pending.decisionContext.intent.risk, 'high');
    assert.ok(pending.decisionContext.agent.allowedChannels.includes('SIGNAL'));
    assert.deepEqual(pending.executed.participantUsage.map((part) =>
      [part.agentId, part.generationTokens, part.controlTokens]),
    [['alice', 15, null], ['bob', null, 4]]);

    const grounded = await runBlocker(db, 'team-grounded', 'verified_ack');
    assert.equal(grounded.executed.grounding.satisfied, true);
    assert.equal(grounded.executed.grounding.source, 'adapter_reported');
    assert.equal(grounded.outcome.grounding.satisfied, true);
    assert.equal(metrics.getMetrics().tokensInput, 28);
    assert.equal(metrics.getMetrics().tokensOutput, 10);

    const topologyDenied = await checkpoint.evaluateCheckpoint({ db, agentId: 'alice',
      checkpoint: 'BLOCKER_DETECTED', topologySnapshot: { topologyId: 'isolated_critics', variantId: 'anonymous' },
      topologyPolicy: { variantId: 'controlled', communicationAllowed: true },
      evidence: { domain: 'mission', semanticRefs: ['mission:topology-denied'] },
      communication: { transport: { deliver: () => { throw new Error('topology-denied communication must not send'); } } } });
    assert.equal(topologyDenied.decision.action, 'SILENCE');
    assert.equal(topologyDenied.constraints.topologyReason, 'TOPOLOGY_VARIANT_MISMATCH');

    const completion = await bridge.evaluateMissionCompletion({ db, agentId: 'alice',
      missionId: 'mission-1', gateAllowed: true,
      communication: { transport: { deliver: () => { throw new Error('must not send'); } } } });
    assert.equal(completion.evaluated, true);
    assert.equal(completion.receipt.decision.action, 'SILENCE');
    assert.equal(completion.receipt.executed.executed, false);
  } finally {
    await db.close();
  }
  console.log('Mission checkpoint communication preserves grounding and per-agent model costs.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
