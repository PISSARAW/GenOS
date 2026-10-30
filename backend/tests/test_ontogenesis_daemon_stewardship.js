'use strict';

const assert = require('node:assert/strict');
const { memoryDb } = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const sensory = require('../src/services/ontogenesis/daemonSensorySystem');
const stewardship = require('../src/services/ontogenesis/daemonStewardshipService');
const { defaultConfig, validateProjectConfig } = require('../src/services/ontogenesis/configSchema');

const ROOT = '/tmp/daemon-stewardship';
const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const TERRITORY = 'territory.daemon-stewardship';

async function migrateDaemon(db) {
  const names = ['migrateDaemonTerritory', 'migrateDaemonFindings',
    'migrateDaemonPhenotype', 'migrateDaemonStigmergy'];
  for (const name of names) await require(`../src/db/migrations/${name}`)[name](db);
}

async function seedTerritory(db) {
  await territoryService.createTerritory(db, {
    id: TERRITORY, organizationId: 'org-1', projectId: 'daemon-project',
    workspaceId: 'workspace-1', repoIdentity: 'stewardship', rootPath: ROOT,
    scopePath: '/', ref: 'main', headSha: HEAD_A, state: 'ACTIVE'
  });
  await db.run('UPDATE daemon_territories SET indexed_head_sha = ? WHERE id = ?', [HEAD_A, TERRITORY]);
  await db.run(`INSERT INTO daemon_runtime_state
    (daemon_id, territory_id, activity, health, last_heartbeat_at)
    VALUES ('daemon.steward', ?, 'REPORTING', 'HEALTHY', datetime('now'))`, [TERRITORY]);
  await db.run(`INSERT INTO daemon_phenotypes
    (territory_id, family, status, pressure, budded_at)
    VALUES (?, 'repair', 'ACTIVE', 0.9, datetime('now'))`, [TERRITORY]);
  await db.run(`INSERT INTO daemon_stigmergy_markers
    (territory_id, scope, kind, intensity) VALUES (?, 'src/repair.js', 'HIGH_RISK', 8)`, [TERRITORY]);
}

async function addFinding(db, input) {
  await db.run(`INSERT INTO daemon_findings
    (id, territory_id, claim, scope_type, scope_value, head_sha, status, created_by)
    VALUES (?, ?, ?, 'file', ?, ?, ?, 'daemon.steward')`,
  [input.id, TERRITORY, input.claim, input.scope, input.head, input.status]);
}

async function main() {
  const db = await memoryDb();
  await migrateDaemon(db);
  const config = defaultConfig();
  config.daemonStewardship.maxOpenTasks = 1;
  const projectId = await store.createProject(db, {
    id: 'onto-daemon-stewardship', rootPath: ROOT,
    branch: 'codex/daemon-stewardship', objective: 'repair autonomously', config
  });
  await seedTerritory(db);
  await addFinding(db, { id: 'finding.repair-a', claim: 'repair unsafe edge',
    scope: 'src/repair.js', head: HEAD_A, status: 'REPAIRABLE' });
  await addFinding(db, { id: 'finding.supported-a', claim: 'inspect uncertain edge',
    scope: 'src/uncertain.js', head: HEAD_A, status: 'SUPPORTED' });

  const snapshotA = await sensory.observeProject(db, { root_path: ROOT });
  const first = await stewardship.reconcileBacklog(db, {
    project: await store.getProject(db, projectId), config, snapshot: snapshotA
  });
  assert.deepEqual(first, { enabled: true, enqueued: 1, retired: 0, eligible: 1 });
  assert.equal((await store.listTasks(db, projectId)).length, 1);
  const taskA = (await store.listTasks(db, projectId))[0];
  assert.match(taskA.title, /^Daemon:/);
  assert.equal(taskA.priority, 97);
  assert.match(taskA.acceptance_json, /finding\.repair-a/);

  const duplicate = await stewardship.reconcileBacklog(db, {
    project: await store.getProject(db, projectId), config, snapshot: snapshotA
  });
  assert.equal(duplicate.enqueued, 0);
  assert.equal((await store.listTasks(db, projectId)).length, 1);

  await db.run('UPDATE daemon_territories SET head_sha = ?, indexed_head_sha = ? WHERE id = ?',
    [HEAD_B, HEAD_B, TERRITORY]);
  await addFinding(db, { id: 'finding.repair-b', claim: 'repair current edge',
    scope: 'src/current.js', head: HEAD_B, status: 'REPAIRABLE' });
  const snapshotB = await sensory.observeProject(db, { root_path: ROOT });
  const advanced = await stewardship.reconcileBacklog(db, {
    project: await store.getProject(db, projectId), config, snapshot: snapshotB
  });
  assert.equal(advanced.retired, 1);
  assert.equal(advanced.enqueued, 1);
  assert.equal((await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [taskA.id])).status, 'blocked');

  const taskB = (await store.listTasks(db, projectId)).find((task) => task.status === 'todo');
  await db.run("UPDATE daemon_runtime_state SET health = 'DEGRADED' WHERE territory_id = ?", [TERRITORY]);
  const degraded = await stewardship.reconcileBacklog(db, {
    project: await store.getProject(db, projectId), config,
    snapshot: await sensory.observeProject(db, { root_path: ROOT })
  });
  assert.equal(degraded.reason, 'daemon-unhealthy');
  await db.run("UPDATE daemon_runtime_state SET health = 'HEALTHY' WHERE territory_id = ?", [TERRITORY]);
  await db.run("UPDATE daemon_runtime_state SET last_heartbeat_at = datetime('now', '-5 minutes') WHERE territory_id = ?", [TERRITORY]);
  const offline = await stewardship.reconcileBacklog(db, {
    project: await store.getProject(db, projectId), config,
    snapshot: await sensory.observeProject(db, { root_path: ROOT })
  });
  assert.equal(offline.reason, 'daemon-not-live');
  assert.equal(offline.retired, 0);
  assert.equal((await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [taskB.id])).status, 'todo');
  assert.equal((await stewardship.recordFailure(db, {
    projectId, taskId: taskB.id, reason: 'check failed'
  })).recorded, true);
  const failure = await db.get('SELECT status, result_json FROM ontogenesis_daemon_proposals WHERE task_id = ?', [taskB.id]);
  assert.equal(failure.status, 'ENQUEUED');
  assert.equal(JSON.parse(failure.result_json).outcome, 'attempt_failed');
  assert.equal((await stewardship.recordIntegration(db, {
    projectId, taskId: taskB.id, sha: 'c'.repeat(40)
  })).recorded, true);
  const summary = await stewardship.summarize(db, projectId);
  assert.deepEqual(summary, { proposals: 2, integrated: 1, stale: 1 });

  const invalid = defaultConfig();
  invalid.daemonStewardship.eligibleStatuses = ['SUPPORTED'];
  assert.equal(validateProjectConfig(invalid).ok, false);
  await db.close();
  console.log('Ontogenesis daemon stewardship tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
