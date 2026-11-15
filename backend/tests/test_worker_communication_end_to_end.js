'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbIndex = require('../src/db');
const { initializeSchema } = require('../src/db/schema');

async function seed(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('comm-org-e2e', 'Comm E2E')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('comm-project-e2e', 'comm-org-e2e', 'Comm Project')");
  await db.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
    VALUES ('comm-workspace-e2e', 'Comm Workspace', '/tmp/comm-e2e', 'comm-org-e2e', 'comm-project-e2e')`);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, metadata_json)
    VALUES ('comm-orch-e2e', 'Comm Orchestrator', 'orchestrator', 'idle', 'orchestrator',
      'comm-workspace-e2e', '{"phenotypeId":"Orchestrator"}')`);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id)
    VALUES ('comm-worker-e2e', 'Comm Worker', 'worker', 'idle', 'worker',
      'comm-workspace-e2e', 'comm-orch-e2e')`);
}

async function drain(subscriber) {
  await subscriber.pollPendingDeliveries();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await subscriber.pollPendingDeliveries();
}

async function assertPheromoneConsumption(db, services) {
  services.garage.armWakeHandler('comm-worker-e2e');
  const result = await services.stigmergy.depositPheromone({
    type: services.stigmergy.SIGNAL_TYPES.EPISTEMIC_HIGH_RISK,
    payload: { semanticType: 'RISK_TRACE' }, locus: 'checkpoint/security',
    locusHash: 'security', intensity: 0.8, isRepellent: false,
    senderAgentId: 'comm-orch-e2e',
    scope: { organizationId: 'comm-org-e2e', projectId: 'comm-project-e2e' }
  }, { db });
  assert.deepEqual(result.recipientAgentIds, ['comm-worker-e2e']);
  await drain(services.subscriber);
  const observation = await db.get(`SELECT semantic_type, locus FROM worker_signal_observations
    WHERE signal_id = ? AND agent_id = 'comm-worker-e2e'`, result.signalId);
  assert.equal(observation.semantic_type, 'RISK_TRACE');
  assert.equal(observation.locus, 'checkpoint/security');
  const delivery = await db.get('SELECT status FROM signal_deliveries WHERE signal_id = ?', result.signalId);
  assert.equal(delivery.status, 'delivered');
}

async function assertSignalWithoutPrompt(db, services) {
  services.garage.armWakeHandler('comm-worker-e2e');
  const result = await services.transport.publishSignal({
    signalId: 'sig-zero-prompt-e2e', signalType: 'ligand',
    signalData: { semanticType: 'READY', concentration: 0.9 },
    topic: 'checkpoint', senderAgentId: 'comm-orch-e2e',
    recipientAgentIds: ['comm-worker-e2e']
  });
  assert.equal(result.llmRequired, false);
  assert.equal(result.escalationQueued, undefined);
  await drain(services.subscriber);
  assert.ok(await db.get(`SELECT signal_id FROM worker_signal_observations
    WHERE signal_id = 'sig-zero-prompt-e2e'`));
  assert.equal(await db.get(`SELECT signal_id FROM signal_cognitive_jobs
    WHERE signal_id = 'sig-zero-prompt-e2e'`), undefined);
}

async function assertTraceReuse(db, checkpoint) {
  await db.run("UPDATE agents SET status = 'completed' WHERE id = 'comm-worker-e2e'");
  const input = { db, agentId: 'comm-orch-e2e', checkpoint: 'NEW_EVIDENCE',
    scope: { organizationId: 'comm-org-e2e', projectId: 'comm-project-e2e' },
    evidence: { domain: 'security', semanticRefs: ['evidence:stable-1'] } };
  const deposited = await checkpoint.evaluateCheckpoint(input);
  assert.equal(deposited.decision.action, 'STIGMERGY');
  assert.equal(deposited.executed.published, true);
  const reused = await checkpoint.evaluateCheckpoint(input);
  assert.equal(reused.decision.action, 'SILENCE');
  assert.ok(reused.decision.reasonCodes.includes('STIGMERGY_TRACE_REUSED'));
}

async function assertMeasuredCognitiveCost(db, cognitiveSignal, modelRouter) {
  const original = modelRouter.generate;
  modelRouter.generate = async (request) => {
    assert.equal(request.routeActionId, 'signal:sig-cost-e2e');
    await db.run(`INSERT INTO model_attempt_ledger
      (id, action_id, agent_id, model, status, provider_called, input_tokens,
       output_tokens, token_usage_source, cost_usd, started_at, finished_at)
      VALUES ('attempt-cost-e2e', ?, ?, 'stub://measured', 'completed', 1, 17, 5,
        'provider', 0.0125, ?, ?)`, request.routeActionId, request.agentId,
    new Date().toISOString(), new Date().toISOString());
    return { text: 'candidate inspect deterministic trace', model: 'stub://measured' };
  };
  try {
    const signal = { signalId: 'sig-cost-e2e', signalType: 'ligand', topic: 'cost',
      senderAgentId: 'comm-orch-e2e', llmRequired: true,
      signalData: { semanticType: 'UNKNOWN', concentration: 1 } };
    const result = await cognitiveSignal.handleSignal({ db, agentId: 'comm-worker-e2e',
      signal, context: { signalId: signal.signalId },
      scope: { organizationId: 'comm-org-e2e', projectId: 'comm-project-e2e' } });
    assert.deepEqual(result.usage, { source: 'model_attempt_ledger', providerCalls: 1,
      tokenCoverage: 'complete', costCoverage: 'complete', inputTokens: 17,
      outputTokens: 5, costUsd: 0.0125 });
  } finally {
    modelRouter.generate = original;
  }
}

async function assertEstimatedUsageStaysUnknown(db, usageService) {
  await db.run(`INSERT INTO model_attempt_ledger
    (id, action_id, agent_id, model, status, provider_called, input_tokens,
     output_tokens, token_usage_source, cost_usd, started_at, finished_at)
    VALUES ('attempt-estimated-e2e', 'signal:sig-estimated-e2e', 'comm-worker-e2e',
      'stub://estimated', 'completed', 1, 20, 6, 'estimate', 0.5, ?, ?)`,
  new Date().toISOString(), new Date().toISOString());
  const usage = await usageService.measure(db, 'sig-estimated-e2e', 'comm-worker-e2e');
  assert.equal(usage.tokenCoverage, 'incomplete');
  assert.equal(usage.costCoverage, 'incomplete');
  assert.equal(usage.inputTokens, null);
  assert.equal(usage.outputTokens, null);
  assert.equal(usage.costUsd, null);
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const originalGetDatabase = dbIndex.getDatabase;
  dbIndex.getDatabase = async () => db;
  let subscriber;
  try {
    await initializeSchema(db);
    await seed(db);
    const services = {
      subscriber: require('../src/services/signalPlaneSubscriber'),
      garage: require('../src/services/workerGarageService'),
      stigmergy: require('../src/services/epistemic/stigmergyInterProcessBridge'),
      transport: require('../src/services/signalingTransportService')
    };
    subscriber = services.subscriber;
    subscriber.startSignalPlaneSubscriber();
    await assertPheromoneConsumption(db, services);
    await assertSignalWithoutPrompt(db, services);
    await assertTraceReuse(db, require('../src/services/communication/communicationCheckpointService'));
    await assertMeasuredCognitiveCost(db, require('../src/services/cognitiveSignalService'),
      require('../src/services/modelRouter'));
    await assertEstimatedUsageStaysUnknown(db,
      require('../src/services/signalCognitiveUsageService'));
    await require('../src/services/synapticPlasticityService').flushPendingWrites();
    console.log('worker communication end-to-end passed');
  } finally {
    if (subscriber) await subscriber.stopSignalPlaneSubscriber();
    dbIndex.getDatabase = originalGetDatabase;
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
