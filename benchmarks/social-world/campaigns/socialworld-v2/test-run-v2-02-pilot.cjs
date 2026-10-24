'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pilot = require('./run-v2-02-pilot.cjs');
const world = require('./v2-02-pilot-world.cjs');
const { validateReport } = require('./validate-report.cjs');

function arm(name, metrics) {
  return { arm: name, completed: true, metrics, comparison: {
    eventsHash: 'events', budgetHash: 'budget', permissionsHash: 'permissions'
  } };
}

function campaignEvidence() {
  const metrics = { cycles: 1000, agents: 24, simulatedDays: 7, modelCalls: 20,
    initiatives: 4, distinctRecipients: 3, reciprocals: 2, validDeliveryReceipts: 6,
    memoryEpisodes: 6, decisionsWithSocialMemory: 4, invalidReceipts: 0 };
  return { warmup: { completed: true, servedModel: 'qwen2.5:14b', schemaValid: true, modelCalls: 1 },
    arms: [arm('existing-social-runtime', metrics), arm('social-development-loop', metrics)] };
}

test('V2-02 pilot contract is recalculable, paired, and report-validator compatible without calling a model', (context) => {
  const evidence = campaignEvidence();
  const evaluation = pilot.evaluatePilot(evidence);
  assert.equal(evaluation.status, 'pass');
  assert.equal(pilot.comparisonKeyHashesEqual(evidence.arms), true);
  assert.equal(pilot.MODEL, 'ollama://qwen2.5:14b');
  assert.equal(pilot.AGENT_COUNT, 24);
  assert.equal(pilot.SIMULATED_DAYS, 7);
  assert.equal(pilot.CYCLES, 1000);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'socialworld-v2-pilot-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reportDir = path.join(root, 'reports');
  fs.mkdirSync(path.join(reportDir, 'evidence'), { recursive: true });
  const evidenceName = 'evidence/pilot.evidence.json';
  fs.writeFileSync(path.join(reportDir, evidenceName), JSON.stringify(evidence));
  const report = pilot.reportFor({ evidence, evidenceName, seed: 'contract-seed',
    comparison: { eventsHash: 'events', budgetHash: 'budget', permissionsHash: 'permissions',
      budget: { maxModelCallsPerDay: 4, maxMessagesPerDay: 4, callsPerDecision: 1 },
      permissions: { organizationId: 'org', projectId: 'project', relationClasses: [], foreignTenants: false } },
    configHash: 'config', sourceCommit: 'source', startedAt: new Date(0).toISOString(), durationMs: 0 });
  const reportPath = path.join(reportDir, 'pilot.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  assert.deepEqual(validateReport(report, reportPath), []);
  assert.equal(report.oracle.recalculable, true);
  assert.equal(report.campaignDisposition, 'diagnostic-pilot');
  assert.match(report.inputs.baselineDefinition, /AGOW/);
  assert.equal(report.inputs.budget.maxModelCallsPerDay, 4);
});

test('V2-02 pilot rejects incomplete arms, unpaired inputs, and invalid delivery receipts', () => {
  const evidence = campaignEvidence();
  evidence.arms[1].comparison.eventsHash = 'different';
  assert.equal(pilot.evaluatePilot(evidence).status, 'inconclusive');
  evidence.arms[1].comparison.eventsHash = 'events';
  evidence.arms[1].metrics.invalidReceipts = 1;
  assert.equal(pilot.evaluatePilot(evidence).status, 'inconclusive');
  evidence.arms[1].metrics.invalidReceipts = 0;
  evidence.arms[1].integrityEvents = [{ eventType: 'warning', detail: 'gvx-ledger-chain-invalid:broken' }];
  assert.match(pilot.evaluatePilot(evidence).errors.join(' '), /gvx-ledger-chain-invalid/);
  evidence.arms[1].integrityEvents = [];
  evidence.arms[1].completed = false;
  assert.equal(pilot.evaluatePilot(evidence).status, 'inconclusive');
  evidence.arms[1].completed = true;
  evidence.warmup.completed = false;
  assert.equal(pilot.evaluatePilot(evidence).status, 'inconclusive');
});

test('V2-02 pilot reports a failed warmup without claiming the unrun arms were unpaired', () => {
  const evaluation = pilot.evaluatePilot({ warmup: { completed: false }, arms: [] });
  assert.equal(evaluation.status, 'inconclusive');
  assert.deepEqual(evaluation.errors, ['qwen-warmup-incomplete', 'qwen-warmup-model-mismatch']);
});

test('V2-02 pilot treats AGOW attention deferral as a no-model observation', () => {
  assert.equal(pilot.attentionDeferred({ processed: false,
    reason: 'agow-did-not-authorize-social-action' }), true);
  assert.equal(pilot.attentionDeferred({ processed: false, reason: 'model-error' }), false);
  const metrics = pilot.metricsOf({ cycles: 1000, memoryEpisodeCount: 0, records: [
    { event: { isReply: false }, modelUsage: { servedModel: 'qwen2.5:14b' } },
    { event: { isReply: false }, modelUsage: null }
  ] });
  assert.equal(metrics.modelCalls, 1);
});

test('V2-02 pilot world makes every social relation traversable in both directions', () => {
  const edges = world.ringEdges();
  assert.equal(edges.length, 48);
  for (const edge of edges) {
    assert.ok(edges.some((candidate) => candidate.sourceAgentId === edge.targetAgentId
      && candidate.targetAgentId === edge.sourceAgentId));
  }
});

test('V2-02 pilot reply supplies a distinct simulated evidence reference and asks for confirmation', () => {
  const reply = world.replyEventFor({ cycle: 32, eventId: 'world-event', day: 0,
    agentId: 'agent-a', domain: 'navigation-7', evidenceRefs: ['world:source'], sourceEventId: 'world-event' },
  'agent-b', 'signal-1');
  assert.equal(reply.replyToAgentId, 'agent-a');
  assert.match(reply.summary, /sourced check/);
  assert.ok(reply.evidenceRefs.includes('world:world-event:reply'));
  assert.ok(reply.evidenceRefs.includes('signal-1'));
});

test('V2-02 pilot rejects invalid memory references in either decision path', () => {
  const response = { structured: { action: 'silence', recipientAgentId: null,
    purpose: 'inform', reasonCode: 'evidence-insufficient', memoryReferences: ['missing'] } };
  assert.throws(() => pilot.validateDecision(response, [], []), /memory-reference/);
  const valid = { structured: { ...response.structured, memoryReferences: ['memory-1'] } };
  assert.deepEqual(pilot.validateDecision(valid, [], [{ id: 'memory-1' }]), valid.structured);
});

test('V2-02 delivery receipt requires a persisted semantic acknowledgement', () => {
  const receipt = { executed: { published: true, signalId: 'sig-1', deliveryAcknowledgements: [
    { recipientAgentId: 'agent-1', status: 'acked', evidenceHash: 'sha256:evidence' }
  ] }, outcome: { deliveryConfirmed: true } };
  assert.deepEqual(pilot.validReceipt(receipt, 'agent-1'), {
    valid: true, delivered: true, reason: null, signalId: 'sig-1'
  });
  assert.equal(pilot.validReceipt(receipt, 'agent-2').valid, false);
  assert.equal(pilot.validReceipt(null, 'agent-1').valid, false);
});

test('isolated pilot databases receive an ephemeral bootstrap password and serial inference cap', () => {
  assert.deepEqual(pilot.databaseEnvironment({ database: 'D:/run/warmup.sqlite', adminPassword: 'ephemeral' }), {
    GENOS_DB_PATH: 'D:/run/warmup.sqlite', GENOS_ADMIN_PASSWORD: 'ephemeral',
    GENOS_INFERENCE_MAX_CONCURRENT: '1'
  });
});
