'use strict';

/**
 * ADR 0290 — les daemons résidents doivent ouvrir la base où les
 * producteurs journalisent `daemon_events`. Régression couverte : une
 * base par daemon laissait les résidents vivants mais sourds.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-shared-db-'));
const sharedPath = path.join(root, 'shared.db');
process.env.GENOS_DB_PATH = sharedPath;
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'isolated-daemon-test-password';

const { getDatabase, closeDatabase, resolveDatabasePath } = require('../src/db');
const deployment = require('../scripts/daemonDeployment.cjs');
const territories = require('../src/services/daemon/daemonTerritoryService');
const productionBridge = require('../src/services/daemon/daemonProductionBridge');
const eventBridge = require('../src/services/daemon/daemonEventBridgeService');
const eventConsumer = require('../src/services/daemon/daemonEventConsumerService');
const runtimeService = require('../src/services/daemon/residentDaemonRuntime');

function testDeploymentTargetsBackendDatabase() {
  assert.strictEqual(resolveDatabasePath(), path.resolve(sharedPath));
  assert.strictEqual(deployment.sharedDatabasePath(), resolveDatabasePath());
  const env = deployment.launchEnvironment({ GENOS_DB_PATH: path.join(root, 'genos-C.db'), KEEP: '1' });
  assert.strictEqual(env.GENOS_DB_PATH, resolveDatabasePath(), 'un daemon ne garde pas de base dédiée');
  assert.strictEqual(env.KEEP, '1');
  assert.strictEqual(deployment.DAEMONS.length, 2);
  assert.notStrictEqual(deployment.DAEMONS[0].daemonId, deployment.DAEMONS[1].daemonId);
}

async function registerResident(db, daemon) {
  const rootPath = fs.mkdtempSync(path.join(root, `repo-${daemon.drive}-`));
  const created = await territories.createTerritory(db, {
    id: daemon.territoryId, organizationId: 'org-test', projectId: 'project-test', workspaceId: 'ws-test',
    repoIdentity: `file://${rootPath.replace(/\\/g, '/')}`, rootPath, scopePath: '/', ref: 'main',
    headSha: 'a'.repeat(40), state: 'ACTIVE', metadata: {}
  });
  assert.strictEqual(created.found, true, JSON.stringify(created.errors || []));
  const runtime = runtimeService.createRuntime(db);
  const registered = await runtimeService.registerDaemon(runtime, {
    daemonId: daemon.daemonId, territoryId: daemon.territoryId, activity: 'DORMANT'
  });
  assert.strictEqual(registered.registered, true, JSON.stringify(registered.errors || []));
  const bridge = eventBridge.createBridge({ db, runtime, daemonId: daemon.daemonId, deferInvestigation: true });
  const context = { db, runtime, bridge, daemonId: daemon.daemonId, territoryId: daemon.territoryId };
  await eventConsumer.initializeCursor(context);
  return { rootPath, context };
}

async function testProducerEventsReachEachResident(db) {
  const residents = [];
  for (const daemon of deployment.DAEMONS) residents.push(await registerResident(db, daemon));
  const emitted = await productionBridge.recordTestOutcome(db, {
    rootPath: residents[0].rootPath, passed: false, scope: 'tests/sample.test.js'
  });
  assert.strictEqual(emitted.emitted, true, JSON.stringify(emitted));

  const first = await eventConsumer.pollDaemonEvents(residents[0].context);
  const second = await eventConsumer.pollDaemonEvents(residents[1].context);
  assert.strictEqual(first.count, 1, 'le résident du territoire reçoit l\'événement du producteur');
  assert.strictEqual(second.count, 0, 'l\'autre résident ne reçoit pas un événement étranger');
}

async function main() {
  testDeploymentTargetsBackendDatabase();
  const db = await getDatabase();
  try {
    await testProducerEventsReachEachResident(db);
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Daemon shared event database contracts passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
