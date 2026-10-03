'use strict';

const assert = require('node:assert/strict');
const {
  resolveRegisteredTerritory,
  createResidentRuntime,
  subscribeToSignals,
  assertHostDaemonRegistered
} = require('../bin/genos-daemon.cjs');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
const runtimeService = require('../src/services/daemon/residentDaemonRuntime');
const eventConsumer = require('../src/services/daemon/daemonEventConsumerService');
const productionBridge = require('../src/services/daemon/daemonProductionBridge');
const signalEventBus = require('../src/services/signalEventBus');

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
  const db = await openDb();
  assert.equal(await resolveRegisteredTerritory(db, 'territory.missing'), null);

  const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daemon_territories'");
  assert.equal(tables.length, 1);
  assert.equal(await db.get('SELECT id FROM daemon_territories WHERE id = ?', 'territory.missing'), undefined);

  await territoryService.createTerritory(db, {
    id: 'territory.host-cli',
    organizationId: 'org-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    repoIdentity: 'host-cli',
    rootPath: '/tmp/host-cli',
    headSha: 'a'.repeat(40),
    state: 'ACTIVE'
  });
  const resolved = await resolveRegisteredTerritory(db, 'territory.host-cli');
  assert.equal(resolved.id, 'territory.host-cli');
  assert.equal(resolved.headSha, 'a'.repeat(40));

  const bridge = bridgeService.createBridge({ db });
  assert.equal(createResidentRuntime(db).db, db);
  const runtime = createResidentRuntime(db);
  await assertHostDaemonRegistered(runtime, {
    daemonId: 'daemon.host-cli', territoryId: 'territory.host-cli'
  });
  await assert.rejects(
    assertHostDaemonRegistered(runtime, {
      daemonId: 'daemon.host-cli', territoryId: 'territory.other'
    }),
    { code: 'DAEMON_REGISTRATION_FAILED' }
  );
  assert.equal((await runtimeService.getDaemonState(runtime, { daemonId: 'daemon.host-cli' })).territoryId,
    'territory.host-cli');
  const hostBridge = bridgeService.createBridge({ db, runtime, daemonId: 'daemon.host-cli' });
  const eventContext = {
    db, runtime, bridge: hostBridge, daemonId: 'daemon.host-cli', territoryId: 'territory.host-cli'
  };
  await eventConsumer.initializeCursor(eventContext);
  const emitted = await productionBridge.emitTerritoryEvent(db, {
    rootPath: '/tmp/host-cli', type: 'TEST_FAILED', payload: { file: 'src/a.js' }
  });
  assert.equal(emitted.emitted, true);
  assert.equal(emitted.woke, false);
  const polled = await eventConsumer.pollDaemonEvents(eventContext);
  assert.equal(polled.count, 1);
  assert.equal((await runtimeService.getDaemonState(runtime, { daemonId: 'daemon.host-cli' })).activity, 'FOCUSED');
  assert.equal((await eventConsumer.pollDaemonEvents(eventContext)).count, 0);

  const unsubscribe = subscribeToSignals(bridge, 'territory.host-cli');
  signalEventBus.publish({
    signalType: 'text',
    signalData: { eventType: 'TERRITORY_COMMIT', headSha: 'b'.repeat(40) }
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const updated = await territoryService.getTerritory(db, { id: 'territory.host-cli' });
  assert.equal(updated.territory.headSha, 'b'.repeat(40));
  unsubscribe();
  await db.close();
  console.log('Daemon host CLI tests passed (registered territory, signal bus lifecycle).');
}

main().catch((error) => { console.error(error); process.exit(1); });
