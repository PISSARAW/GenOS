'use strict';

const assert = require('node:assert/strict');
const bridge = require('../src/services/daemon/daemonProductionBridge');
const territoryService = require('../src/services/daemon/daemonTerritoryService');

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const ROOT = '/tmp/territory.live-prod';

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

async function eventTypes(db) {
  const rows = await db.all('SELECT event_type FROM daemon_events ORDER BY id');
  return rows.map((r) => r.event_type);
}

async function main() {
  const db = await openDb();

  // 1. Sans territoire enregistré : refus explicite, zéro écriture, jamais de throw.
  const refused = await bridge.announceMissionStart({ db, request: { mission: 'x' }, repoRoot: '/tmp/nowhere' });
  assert.equal(refused.announced, false);
  assert.equal(refused.reason, 'no-territory-registered');
  assert.equal(await bridge.resolveTerritoryByRoot(db, '/tmp/nowhere'), null);
  assert.equal((await bridge.announceMissionStart(null)).announced, false);
  assert.equal((await bridge.announceMissionStart({})).announced, false);

  // 2. Territoire enregistré → ORCHESTRATOR_ENTERED journalisé (lookup seule).
  await territoryService.createTerritory(db, {
    id: 'territory.live-prod',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'live-prod',
    rootPath: ROOT,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  assert.equal(await bridge.resolveTerritoryByRoot(db, ROOT), 'territory.live-prod');
  const announced = await bridge.announceMissionStart({ db, request: { mission: 'probe' }, repoRoot: ROOT });
  assert.equal(announced.announced, true);
  assert.equal(announced.territoryId, 'territory.live-prod');
  assert.ok((await eventTypes(db)).includes('ORCHESTRATOR_ENTERED'));

  // 3. Résolution par workspacePath de la requête en priorité.
  const viaWorkspace = await bridge.announceMissionStart({ db, request: { workspacePath: ROOT }, repoRoot: '/tmp/nowhere' });
  assert.equal(viaWorkspace.announced, true);

  // 4. Outcomes : TEST_FAILED / TEST_RECOVERED / BUILD_FAILED / TERRITORY_COMMIT.
  await bridge.recordTestOutcome(db, { rootPath: ROOT, scope: 'auth.test.js', passed: false });
  await bridge.recordTestOutcome(db, { rootPath: ROOT, scope: 'auth.test.js', passed: true });
  await bridge.recordBuildFailed(db, { rootPath: ROOT, scope: 'backend' });
  await bridge.recordCommit(db, { rootPath: ROOT, headSha: HEAD_B });
  const types = await eventTypes(db);
  assert.ok(types.includes('TEST_FAILED'));
  assert.ok(types.includes('TEST_RECOVERED'));
  assert.ok(types.includes('BUILD_FAILED'));
  assert.ok(types.includes('TERRITORY_COMMIT'));
  const moved = await territoryService.getTerritory(db, { id: 'territory.live-prod' });
  assert.equal(moved.territory.headSha, HEAD_B);

  // 5. Outcomes sans territoire : refus doux, pas d'écriture.
  const before = types.length;
  assert.equal((await bridge.recordTestOutcome(db, { rootPath: '/tmp/nowhere', passed: false })).emitted, false);
  assert.equal((await eventTypes(db)).length, before);

  await db.close();
  console.log('Daemon production bridge tests passed (lookup-only, graceful, mission announce wired).');
}

main().catch((error) => { console.error(error); process.exit(1); });
