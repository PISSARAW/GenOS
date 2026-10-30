'use strict';

const assert = require('node:assert/strict');
const receptorRegistry = require('../src/services/daemon/daemonReceptorRegistry');
const wakePolicy = require('../src/services/daemon/daemonWakePolicyService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const daemonRuntime = require('../src/services/daemon/residentDaemonRuntime');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    get: (sql, ...args) => db.get(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

async function main() {
  // 1. Registre : 16 événements, receptors typés
  assert.equal(receptorRegistry.listDaemonEvents().length, 16);
  assert.equal(receptorRegistry.getReceptorFor('TEST_FAILED').priority, 'high');
  assert.equal(receptorRegistry.getReceptorFor('AGENT_COMPLETED').priority, 'low');
  assert.equal(receptorRegistry.getReceptorFor('ORCHESTRATOR_ENTERED').handoffRequested, true);
  assert.equal(receptorRegistry.getReceptorFor('NOPE'), null);

  // 2. Wake policy : low ne réveille jamais
  const policy = wakePolicy.createWakePolicy({ cooldownMs: 5000, maxWakes: 2, windowMs: 60000 });
  const low = wakePolicy.shouldWake(policy, { territoryId: 't1', eventType: 'AGENT_COMPLETED', priority: 'low', now: 1000 });
  assert.equal(low.woke, false);

  // 3. Cooldown supprime les rafales
  const first = wakePolicy.shouldWake(policy, { territoryId: 't1', eventType: 'TEST_FAILED', priority: 'high', now: 1000 });
  assert.equal(first.woke, true);
  const burst = wakePolicy.shouldWake(policy, { territoryId: 't1', eventType: 'TEST_FAILED', priority: 'high', now: 1500 });
  assert.equal(burst.woke, false);
  assert.equal(burst.reason, 'cooldown');

  // 4. Budget anti-tempête par fenêtre
  wakePolicy.shouldWake(policy, { territoryId: 't1', eventType: 'BUILD_FAILED', priority: 'high', now: 10000 });
  const exhausted = wakePolicy.shouldWake(policy, { territoryId: 't1', eventType: 'AGENT_FAILED', priority: 'high', now: 20000 });
  assert.equal(exhausted.woke, false);
  assert.equal(exhausted.reason, 'wake-budget-exhausted');

  // 5. Bridge bout-en-bout : TEST_FAILED réveille, AGENT_COMPLETED persiste silencieux
  const db = await openDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-event-bridge-'));
  fs.writeFileSync(path.join(root, 'probe.js'), 'module.exports = 1;\n');
  await territoryService.createTerritory(db, {
    id: 'territory.bridge-test',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'bridge-test',
    rootPath: root,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  await require('../src/services/daemon/cartography/cartographerService').scanTerritory(db,
    { territoryId: 'territory.bridge-test', rootPath: root, scopePath: '/' });
  const rt = daemonRuntime.createRuntime(db, {});
  await daemonRuntime.registerDaemon(rt, { daemonId: 'daemon.bridge-1', territoryId: 'territory.bridge-test' });
  await daemonRuntime.heartbeat(rt, { daemonId: 'daemon.bridge-1', activity: 'SURVEYING' });
  await daemonRuntime.heartbeat(rt, { daemonId: 'daemon.bridge-1', activity: 'DORMANT' });
  const bridge = bridgeService.createBridge({ db, runtime: rt, daemonId: 'daemon.bridge-1', policy: wakePolicy.createWakePolicy({ cooldownMs: 0 }) });

  const failed = await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.bridge-test' });
  assert.equal(failed.ingested, true);
  assert.equal(failed.woke, true);
  assert.equal(failed.llmRequired, false);
  const stateAfterWake = await daemonRuntime.getDaemonState(rt, { daemonId: 'daemon.bridge-1' });
  assert.equal(stateAfterWake.activity, 'FOCUSED');

  const retryRuntime = daemonRuntime.createRuntime(null, {});
  const retryBridge = bridgeService.createBridge({ db, runtime: retryRuntime, daemonId: 'daemon.retry-1',
    policy: wakePolicy.createWakePolicy({ cooldownMs: 60000 }) });
  const deferred = await bridgeService.ingestEvent(retryBridge, {
    type: 'TEST_FAILED', territoryId: 'territory.bridge-test'
  });
  assert.equal(deferred.woke, false);
  await daemonRuntime.registerDaemon(retryRuntime, {
    daemonId: 'daemon.retry-1', territoryId: 'territory.bridge-test'
  });
  await daemonRuntime.heartbeat(retryRuntime, { daemonId: 'daemon.retry-1', activity: 'SURVEYING' });
  await daemonRuntime.heartbeat(retryRuntime, { daemonId: 'daemon.retry-1', activity: 'DORMANT' });
  const persistedRetry = await db.get('SELECT * FROM daemon_events ORDER BY id DESC LIMIT 1');
  const retried = await bridgeService.processPersistedEvent(retryBridge, persistedRetry);
  assert.equal(retried.woke, true, 'failed heartbeat must release the wake budget so the event can retry');

  const secondRuntime = daemonRuntime.createRuntime(db, {});
  const conflict = await daemonRuntime.registerDaemon(secondRuntime, {
    daemonId: 'daemon.bridge-2', territoryId: 'territory.bridge-test'
  });
  assert.equal(conflict.registered, false, 'one durable resident owns each territory');

  const quiet = await bridgeService.ingestEvent(bridge, { type: 'AGENT_COMPLETED', territoryId: 'territory.bridge-test' });
  assert.equal(quiet.ingested, true);
  assert.equal(quiet.woke, false);

  const graphBefore = await db.get("SELECT hash FROM territory_graph_nodes WHERE territory_id = ? AND path = 'probe.js' AND kind = 'file'", 'territory.bridge-test');
  fs.writeFileSync(path.join(root, 'probe.js'), 'module.exports = 2;\n');
  const changed = await bridgeService.ingestEvent(bridge, { type: 'TERRITORY_FILE_CHANGED',
    territoryId: 'territory.bridge-test', payload: { files: ['probe.js'] } });
  assert.equal(changed.cheapUpdate.applied, true);
  assert.equal(changed.cheapUpdate.kind, 'files');
  const graphAfter = await db.get("SELECT hash FROM territory_graph_nodes WHERE territory_id = ? AND path = 'probe.js' AND kind = 'file'", 'territory.bridge-test');
  assert.notEqual(graphAfter.hash, graphBefore.hash);

  const consumer = require('../src/services/daemon/daemonEventConsumerService');
  await daemonRuntime.heartbeat(rt, { daemonId: 'daemon.bridge-1', activity: 'DORMANT' });
  const consumerContext = { db, runtime: rt, bridge: bridgeService.createBridge({ db, runtime: rt,
    daemonId: 'daemon.bridge-1', policy: wakePolicy.createWakePolicy({ maxWakes: 1 }) }),
    daemonId: 'daemon.bridge-1', territoryId: 'territory.bridge-test' };
  await consumer.initializeCursor(consumerContext);
  await bridgeService.ingestEvent(bridgeService.createBridge({ db }), {
    type: 'TEST_FAILED', territoryId: 'territory.bridge-test' });
  await consumer.pollDaemonEvents(consumerContext);
  await bridgeService.ingestEvent(bridgeService.createBridge({ db }), {
    type: 'BUILD_FAILED', territoryId: 'territory.bridge-test' });
  const deferredDelivery = await consumer.pollDaemonEvents(consumerContext);
  assert.equal(deferredDelivery.count, 1, 'pending event is observed for retry');
  const pendingEvent = await db.get("SELECT id, woke FROM daemon_events WHERE event_type = 'BUILD_FAILED' ORDER BY id DESC LIMIT 1");
  const cursor = await db.get('SELECT last_event_id FROM daemon_event_cursors WHERE daemon_id = ?', 'daemon.bridge-1');
  assert.equal(cursor.last_event_id < pendingEvent.id, true);

  const restored = await wakePolicy.loadWakePolicy(db, 'territory.bridge-test');
  assert.equal(restored.found, true);
  assert.equal(restored.policy.wakeStampsByTerritory.get('territory.bridge-test').length, 1);
  await wakePolicy.saveWakePolicy(db, 'territory.bridge-test', bridge.policy);
  assert.equal((await wakePolicy.loadWakePolicy(db, 'territory.bridge-test')).found, true);

  // 6. TERRITORY_COMMIT avance le HEAD (commit-aware)
  const commit = await bridgeService.ingestEvent(bridge, {
    type: 'TERRITORY_COMMIT',
    territoryId: 'territory.bridge-test',
    headSha: HEAD_B
  });
  assert.equal(commit.cheapUpdate.kind, 'head');
  assert.equal(commit.cheapUpdate.changed, true);
  const moved = await territoryService.getTerritory(db, { id: 'territory.bridge-test' });
  assert.equal(moved.territory.headSha, HEAD_B);
  assert.equal(territoryService.isKnowledgeStale(moved.territory, HEAD_A), true);

  // 7. ORCHESTRATOR_ENTERED demande un handoff (D11 le compilera)
  const entered = await bridgeService.ingestEvent(bridge, { type: 'ORCHESTRATOR_ENTERED', territoryId: 'territory.bridge-test' });
  assert.equal(entered.handoffRequested, true);

  // 8. Événement inconnu : rejet propre, pas de throw
  const bad = await bridgeService.ingestEvent(bridge, { type: 'BOGUS', territoryId: 'territory.bridge-test' });
  assert.equal(bad.ingested, false);

  await db.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Daemon event bridge tests passed (registry, policy, cheap updates, head advance, handoff flag).');
}

main().catch((error) => { console.error(error); process.exit(1); });
