'use strict';

const assert = require('node:assert/strict');
const receptorRegistry = require('../src/services/daemon/daemonReceptorRegistry');
const wakePolicy = require('../src/services/daemon/daemonWakePolicyService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const daemonRuntime = require('../src/services/daemon/residentDaemonRuntime');

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
  await territoryService.createTerritory(db, {
    id: 'territory.bridge-test',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'bridge-test',
    rootPath: '/tmp/bridge-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  const rt = daemonRuntime.createRuntime(db, {});
  await daemonRuntime.registerDaemon(rt, { daemonId: 'daemon.bridge-1', territoryId: 'territory.bridge-test' });
  const bridge = bridgeService.createBridge({ db, runtime: rt, daemonId: 'daemon.bridge-1' });

  const failed = await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.bridge-test' });
  assert.equal(failed.ingested, true);
  assert.equal(failed.woke, true);
  assert.equal(failed.llmRequired, false);
  const stateAfterWake = await daemonRuntime.getDaemonState(rt, { daemonId: 'daemon.bridge-1' });
  assert.equal(stateAfterWake.activity, 'FOCUSED');

  const quiet = await bridgeService.ingestEvent(bridge, { type: 'AGENT_COMPLETED', territoryId: 'territory.bridge-test' });
  assert.equal(quiet.ingested, true);
  assert.equal(quiet.woke, false);

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
  console.log('Daemon event bridge tests passed (registry, policy, cheap updates, head advance, handoff flag).');
}

main().catch((error) => { console.error(error); process.exit(1); });
