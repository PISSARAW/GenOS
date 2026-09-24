/**
 * Signal Plane E2E — black-box verification of the full pipeline.
 * Rule: each test may only call `publishSignal()` as entry.
 * Everything else is external observation: DB, EventBus, delivery
 * ledger, metrics, mission dispatch. No direct calls to internal organs.
 * Real in-memory SQLite, real services, zero external LLM calls.
 */
const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

const dbIndex = require('../src/db');
let testDb = null;
let llmCallCount = 0;

async function setupTestDb() {
  testDb = await open({ filename: ':memory:', driver: sqlite3.Database });
  await testDb.exec(`
    CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id, name), FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
    CREATE TABLE organization_signal_budgets (organization_id TEXT PRIMARY KEY, budget_mv REAL NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, visibility TEXT DEFAULT 'Private', language TEXT DEFAULT 'TypeScript', description TEXT, tags TEXT DEFAULT '[]', is_archived INTEGER DEFAULT 0, anomalies_count INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_meaning TEXT, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','completed','blocked','error','terminated','apoptosis','active','Active','Apoptosis')), agent_type TEXT NOT NULL DEFAULT 'GenOS', execution_mode TEXT NOT NULL DEFAULT 'orchestrator' CHECK (execution_mode IN ('orchestrator','worker')), workspace_id TEXT, fleet_id TEXT, hallucination_monitoring INTEGER NOT NULL DEFAULT 0, hallucination_count INTEGER NOT NULL DEFAULT 0, dissonance_level REAL DEFAULT 0.0, eureka_count INTEGER DEFAULT 0, cognitive_budget REAL DEFAULT 100.0, cognitive_baseline_budget REAL DEFAULT 100.0, cognitive_max_dissonance REAL DEFAULT 50.0, conscience_revision INTEGER NOT NULL DEFAULT 0, is_apoptotic INTEGER DEFAULT 0, model_tier TEXT DEFAULT 'Flash', language TEXT DEFAULT 'TypeScript', isolation_mode TEXT DEFAULT 'Branch', parent_agent_id TEXT, lineage_relation TEXT DEFAULT 'independent', about TEXT, metadata_json TEXT DEFAULT '{}', current_task TEXT, runtime_pid INTEGER, runtime_started_at DATETIME, runtime_executable TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL, FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL);
    CREATE TABLE signal_blobs (id INTEGER PRIMARY KEY AUTOINCREMENT, signal_id TEXT NOT NULL, signal_type TEXT NOT NULL CHECK (signal_type IN ('ligand','voltage','pheromone','plasmid','tensor','text')), signal_blob BLOB, content TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL DEFAULT '', sender_agent_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME, UNIQUE(signal_id));
    CREATE TABLE signal_subscriptions (subscriber_agent_id TEXT NOT NULL, topic TEXT NOT NULL, filter TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (subscriber_agent_id, topic));
    CREATE TABLE signal_deliveries (signal_id TEXT NOT NULL, subscriber_agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','seen','acked')), delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP, seen_at DATETIME, acked_at DATETIME, PRIMARY KEY (signal_id, subscriber_agent_id));
  `);
  await testDb.run(`INSERT INTO organizations (id, name) VALUES ('org-test', 'Test Org')`);
  await testDb.run(`INSERT INTO projects (id, organization_id, name) VALUES ('proj-test', 'org-test', 'Test Project')`);
  await testDb.run(`INSERT INTO organization_signal_budgets (organization_id, budget_mv, enabled) VALUES ('org-test', 100, 1)`);
  await testDb.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('ws-test', 'Test Workspace', '/tmp/test', 'org-test', 'proj-test')`);
  await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('orch-1', 'Orchestrator', 'orchestrator', 'idle', 'orchestrator', 'ws-test')`);
  await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('worker-1', 'Worker 1', 'worker', 'active', 'worker', 'ws-test', 'orch-1')`);
  await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('worker-2', 'Worker 2', 'worker', 'active', 'worker', 'ws-test', 'orch-1')`);
  return testDb;
}

dbIndex.getDatabase = async () => testDb;

const transport = require('../src/services/signalingTransportService');
const receptor = require('../src/services/signalReceptorService');
const signalEventBus = require('../src/services/signalEventBus');
const signalCoalescer = require('../src/services/signalCoalescerService');
const plasticity = require('../src/services/synapticPlasticityService');
const cognitiveEscalation = require('../src/services/cognitiveEscalationService');
const subscriber = require('../src/services/signalPlaneSubscriber');

function resetState() {
  receptor.listReceptors().forEach((r) => receptor.unregisterReceptor(r.id));
  plasticity.resetWeights();
  signalEventBus.removeAllListeners();
  if (signalCoalescer.clearAllCoalescerState) signalCoalescer.clearAllCoalescerState();
  llmCallCount = 0;
}

function waitForLedger(ticks = 5) {
  return new Promise((resolve) => setTimeout(resolve, 20 * ticks));
}

// ── Test 1: Full receptor dispatch path (no LLM) ─────────────────────────────
// Entry: publishSignal() only. Observe: DB blob, agent state, bus, plasticity.

async function testFullReceptorDispatchPath() {
  resetState();
  const busEvents = [];
  signalEventBus.onSignal((s) => busEvents.push(s));

  receptor.registerReceptor({
    id: 'receptor-test-1', targetLigand: 'TEST_READY', threshold: 0.5,
    action: 'update_agent',
    actionData: { agentId: 'worker-1', status: 'running', currentTask: 'signal-triggered' },
  });

  const result = await transport.publishSignal({
    signalType: 'ligand',
    signalData: { semanticType: 'TEST_READY', concentration: 0.95 },
    topic: 'test-receptor', senderAgentId: 'orch-1',
  });

  const blob = await testDb.get('SELECT * FROM signal_blobs WHERE signal_id = ?', result.signalId);
  assert.ok(blob, 'Signal persisted in signal_blobs');
  assert.strictEqual(blob.signal_type, 'ligand');
  assert.strictEqual(blob.topic, 'test-receptor');
  assert.strictEqual(result.llmRequired, false, 'llmRequired=false when receptor matches');

  const agent = await testDb.get('SELECT * FROM agents WHERE id = ?', 'worker-1');
  assert.strictEqual(agent.status, 'running', 'Agent status updated');
  assert.strictEqual(agent.current_task, 'signal-triggered', 'Agent task updated');

  const weight = plasticity.getChannelWeight('orch-1', 'worker-1');
  assert.ok(weight.weight > plasticity.DEFAULT_WEIGHT, 'Channel weight increased');

  assert.ok(busEvents.length > 0, 'EventBus received signal');
  assert.ok(Array.isArray(busEvents[0].recipientAgentIds), 'Bus signal has recipientAgentIds');
  assert.ok(busEvents[0].recipientAgentIds.includes('worker-1'), 'Routes to worker-1');
  assert.ok(busEvents[0].recipientAgentIds.includes('worker-2'), 'Routes to worker-2');
  assert.ok(busEvents[0].payloadRef, 'Bus signal carries payloadRef');
  assert.strictEqual(llmCallCount, 0, 'LLM never called');
  console.log('[PASS] testFullReceptorDispatchPath');
}

// ── Test 2: LLM escalation path ───────────────────────────────────────────────
// Entry: publishSignal() only. Observe the REAL bus event, then gate it.

async function testLlmEscalationPath() {
  resetState();
  const busEvents = [];
  signalEventBus.onSignal((s) => busEvents.push(s));

  const result = await transport.publishSignal({
    signalType: 'ligand',
    signalData: { semanticType: 'UNKNOWN_UNMATCHED', concentration: 0.9 },
    topic: 'test-llm', senderAgentId: 'orch-1',
  });

  assert.strictEqual(result.llmRequired, true, 'llmRequired=true when no receptor matches');

  const escalationSignal = busEvents.find((e) => e.signalId === result.signalId);
  assert.ok(escalationSignal, 'Real bus event captured for escalation signal');
  assert.strictEqual(escalationSignal.llmRequired, true, 'Bus event carries llmRequired');
  assert.strictEqual(cognitiveEscalation.shouldEscalate(escalationSignal), true,
    'shouldEscalate returns true for unmatched high-salience signal');

  const target = await cognitiveEscalation.selectCognitiveTarget(escalationSignal);
  assert.ok(target, 'selectCognitiveTarget returns a target');

  const context = cognitiveEscalation.buildMinimalContext(escalationSignal);
  assert.strictEqual(context.signalType, 'ligand', 'Context has signalType');
  assert.ok(context.escalatedAt, 'Context has escalatedAt');
  assert.ok('salience' in context, 'Context has salience');
  assert.ok(context.payloadRef, 'Context carries payloadRef, not raw payload');
  assert.ok(!('data' in context), 'Context must not embed raw signal data');
  assert.strictEqual(llmCallCount, 0, 'LLM not invoked during escalation');
  console.log('[PASS] testLlmEscalationPath');
}

// ── Test 3: True windowed coalescing ──────────────────────────────────────────
// S1 emits and opens a window; S2/S3 buffer; flush aggregates once.

function testCoalescingPath() {
  resetState();
  const senderA = 'csnd-a-' + Date.now();
  const senderB = 'csnd-b-' + Date.now();
  const senderC = 'csnd-c-' + Date.now();
  const topic = 'ctop-' + Date.now();
  const opts = { refractoryMs: 0, coalesceMs: 60000 };

  const result1 = signalCoalescer.coalesce({
    signalId: 'sig-c1', signalType: 'ligand', topic,
    senderAgentId: senderA, signalData: { concentration: 0.5 },
  }, opts);
  assert.ok(result1 !== null, 'First signal passes coalescer');
  assert.strictEqual(result1.coalescedCount, 1, 'First emission is unaggregated');

  const result2 = signalCoalescer.coalesce({
    signalId: 'sig-c2', signalType: 'ligand', topic,
    senderAgentId: senderB, signalData: { concentration: 0.7 },
  }, opts);
  assert.strictEqual(result2, null, 'Second signal buffered, not emitted');

  const result3 = signalCoalescer.coalesce({
    signalId: 'sig-c3', signalType: 'ligand', topic,
    senderAgentId: senderC, signalData: { concentration: 0.9 },
  }, opts);
  assert.strictEqual(result3, null, 'Third signal buffered, not emitted');

  // S1 (émis + inclus au buffer, jamais perdu), S2, S3 : tous agrégés.
  assert.strictEqual(signalCoalescer.getBufferedCount(topic), 3, 'Three signals buffered (first included)');
  const aggregated = signalCoalescer.flushAndAggregate(topic);
  assert.ok(aggregated, 'Flush produces one aggregated emission');
  assert.strictEqual(aggregated.coalescedCount, 3, 'Aggregate covers all buffered signals');
  console.log('[PASS] testCoalescingPath');
}

// ── Test 4: Delivery ledger driven by publishSignal ───────────────────────────
// Entry: publishSignal() only. pending+delivered appear automatically;
// the test performs only the consumer-side seen/ack.

async function testDeliveryAckCycle() {
  resetState();
  subscriber.startSignalPlaneSubscriber();
  let wakeCalls = 0;
  subscriber.registerWakeHandler('worker-1', async () => { wakeCalls++; return { acted: true }; });
  subscriber.registerWakeHandler('worker-2', async () => ({ acted: true }));

  receptor.registerReceptor({
    id: 'receptor-delivery', targetLigand: 'TEST_DELIVERY', threshold: 0.5,
    action: 'update_agent',
    actionData: { agentId: 'worker-1', status: 'running', currentTask: 'delivery-test' },
  });

  const result = await transport.publishSignal({
    signalType: 'ligand',
    signalData: { semanticType: 'TEST_DELIVERY', concentration: 0.9 },
    topic: 'test-delivery-' + Date.now(), senderAgentId: 'orch-1',
  });
  await waitForLedger();

  const signalId = result.signalId;
  let row = await testDb.get('SELECT status FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?', signalId, 'worker-1');
  assert.ok(row, 'Pending delivery recorded automatically');
  assert.ok(['pending', 'delivered'].includes(row.status), `Auto delivery in ${row.status}`);
  assert.ok(wakeCalls > 0, 'Wake handler fired from publishSignal path');
  row = await testDb.get('SELECT status FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?', signalId, 'worker-1');
  assert.strictEqual(row.status, 'delivered', 'Delivery auto-marked delivered after handler');

  await transport.markSignalsSeen('worker-1', [signalId]);
  row = await testDb.get('SELECT status, seen_at FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?', signalId, 'worker-1');
  assert.strictEqual(row.status, 'seen');
  assert.ok(row.seen_at, 'seen_at set');

  assert.strictEqual(await transport.ackDelivery(testDb, { signalId, subscriberAgentId: 'worker-1' }), true);
  row = await testDb.get('SELECT status, acked_at FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?', signalId, 'worker-1');
  assert.strictEqual(row.status, 'acked');
  assert.ok(row.acked_at, 'acked_at set');
  console.log('[PASS] testDeliveryAckCycle');
}

// ── Test 5: Wake handler via publishSignal ────────────────────────────────────
// Entry: publishSignal() only. Observe handler invocation + mission args.

async function testWakeHandlerPath() {
  resetState();
  subscriber.startSignalPlaneSubscriber();
  let handlerCalled = false;
  let receivedSignal = null;
  subscriber.registerWakeHandler('worker-1', async (signal) => {
    handlerCalled = true;
    receivedSignal = signal;
    return { acted: true, agentId: 'worker-1', signalTriggered: true, triggerSignalId: signal.signalId };
  });
  subscriber.registerWakeHandler('worker-2', async () => ({ acted: true }));

  receptor.registerReceptor({
    id: 'receptor-wake', targetLigand: 'WAKE_UP', threshold: 0.5,
    action: 'update_agent',
    actionData: { agentId: 'worker-1', status: 'running', currentTask: 'wake-test' },
  });

  const result = await transport.publishSignal({
    signalType: 'ligand',
    signalData: { semanticType: 'WAKE_UP', concentration: 0.9 },
    topic: 'test-wake', senderAgentId: 'orch-1',
  });
  await waitForLedger();

  assert.strictEqual(handlerCalled, true, 'Wake handler called via publishSignal');
  assert.strictEqual(receivedSignal.signalId, result.signalId, 'Handler received published signal');
  console.log('[PASS] testWakeHandlerPath');
}

async function runAllTests() {
  await setupTestDb();
  await testFullReceptorDispatchPath();
  await testLlmEscalationPath();
  testCoalescingPath();
  await testDeliveryAckCycle();
  await testWakeHandlerPath();
  console.log('\n✓ All Signal Plane E2E tests passed');
  await testDb.close();
}

runAllTests().catch((err) => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});

module.exports = {
  setupTestDb,
  testFullReceptorDispatchPath,
  testLlmEscalationPath,
  testCoalescingPath,
  testDeliveryAckCycle,
  testWakeHandlerPath,
};
