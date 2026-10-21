'use strict';

const assert = require('node:assert/strict');
const { memoryDb } = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const sensory = require('../src/services/ontogenesis/daemonSensorySystem');
const topology = require('../src/services/ontogenesis/topologySelector');
const control = require('../src/services/ontogenesis/controlService');
const { tickOnce } = require('../src/services/ontogenesis/tickService');

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const ROOT = '/tmp/ontogenesis-sensory';
const FAMILIES = ['security', 'contract', 'dependency', 'documentation', 'historian',
  'chaperone', 'metabolic', 'cross_repo', 'repair', 'deep_research'];

async function migrateDaemonTables(db) {
  const names = ['migrateDaemonTerritory', 'migrateDaemonFindings',
    'migrateDaemonPhenotype', 'migrateDaemonStigmergy'];
  for (const name of names) await require(`../src/db/migrations/${name}`)[name](db);
}

async function seedTerritory(db) {
  await territoryService.createTerritory(db, {
    id: 'territory.ontogenesis-sensory', organizationId: 'org-1', projectId: 'daemon-project',
    workspaceId: 'workspace-1', repoIdentity: 'sensory', rootPath: ROOT,
    scopePath: '/', ref: 'main', headSha: HEAD, state: 'ACTIVE'
  });
  await db.run(`UPDATE daemon_territories SET indexed_head_sha = ?, last_indexed_at = datetime('now')
    WHERE id = ?`, [HEAD, 'territory.ontogenesis-sensory']);
  await db.run(`INSERT INTO daemon_runtime_state
    (daemon_id, territory_id, activity, health, last_heartbeat_at)
    VALUES ('daemon.sensory', 'territory.ontogenesis-sensory', 'REPORTING', 'HEALTHY', datetime('now'))`);
}

async function seedSignals(db) {
  await db.run(`INSERT INTO daemon_phenotypes
    (territory_id, family, status, pressure, budded_at)
    VALUES (?, 'security', 'ACTIVE', 0.9, datetime('now'))`, ['territory.ontogenesis-sensory']);
  await db.run(`INSERT INTO daemon_findings
    (id, territory_id, claim, scope_type, scope_value, head_sha, status, created_by)
    VALUES ('finding.current', ?, 'contract risk', 'file', 'src/auth.js', ?, 'SUPPORTED', 'daemon.sensory')`,
  ['territory.ontogenesis-sensory', HEAD]);
  await db.run(`INSERT INTO daemon_findings
    (id, territory_id, claim, scope_type, scope_value, head_sha, status, created_by)
    VALUES ('finding.stale-head', ?, 'old risk', 'file', 'src/old.js', ?, 'REPAIRABLE', 'daemon.sensory')`,
  ['territory.ontogenesis-sensory', OLD_HEAD]);
  await db.run(`INSERT INTO daemon_stigmergy_markers
    (territory_id, scope, kind, intensity) VALUES (?, 'src/auth.js', 'HIGH_RISK', 8)`,
  ['territory.ontogenesis-sensory']);
}

function topologyInput(family) {
  return {
    taskKind: 'implement',
    mission: 'implement safely',
    allowedTopologies: topology.CATALOG.map((entry) => entry.id),
    availableCapabilities: ['execute', 'verify', 'coordinate', 'analyze', 'observe'],
    memoryLevel: 'normal', failures: [], variant: 'default',
    sensoryPhenotypes: [{ family, pressure: 0.9 }]
  };
}

async function main() {
  const db = await memoryDb();
  await migrateDaemonTables(db);
  const projectId = await store.createProject(db, {
    id: 'onto-sensory', rootPath: ROOT, branch: 'codex/sensory', objective: 'grow safely'
  });

  const absent = await sensory.observeProject(db, { root_path: '/tmp/no-daemon' });
  assert.equal(absent.available, false);
  assert.equal(absent.reason, 'no-territory-registered');

  await seedTerritory(db);
  await seedSignals(db);
  const snapshot = await sensory.observeProject(db, { root_path: ROOT });
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.fresh, true);
  assert.equal(snapshot.daemon.live, true);
  assert.deepEqual(snapshot.activePhenotypes.map((item) => item.family), ['security']);
  assert.deepEqual(snapshot.findings.map((item) => item.id), ['finding.current']);
  assert.equal(snapshot.attention[0].kind, 'HIGH_RISK');
  assert.equal(snapshot.authority, 'advisory');
  assert.equal(snapshot.mayAuthorize, false);
  assert.equal(snapshot.mayPromote, false);

  const first = await sensory.publishObservation(db, { projectId, snapshot });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const observedAgain = await sensory.observeProject(db, { root_path: ROOT });
  assert.equal(observedAgain.fingerprint, snapshot.fingerprint);
  const duplicate = await sensory.publishObservation(db, { projectId, snapshot: observedAgain });
  assert.equal(first.published, true);
  assert.equal(duplicate.published, false);
  const events = await db.all("SELECT type, payload_json FROM ontogenesis_events WHERE project_id = ?", [projectId]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'wake');
  assert.equal(JSON.parse(events[0].payload_json).authority, 'advisory');
  await db.run('UPDATE daemon_territories SET indexed_head_sha = ? WHERE id = ?',
    [OLD_HEAD, 'territory.ontogenesis-sensory']);
  const stale = await sensory.observeProject(db, { root_path: ROOT });
  assert.equal(stale.fresh, false);
  assert.equal((await sensory.publishObservation(db, { projectId, snapshot: stale })).published, false);
  await db.run('UPDATE daemon_territories SET indexed_head_sha = ? WHERE id = ?',
    [HEAD, 'territory.ontogenesis-sensory']);

  assert.deepEqual(Object.keys(sensory.PHENOTYPE_TOPOLOGIES).sort(), FAMILIES.slice().sort());
  assert.deepEqual(Object.keys(topology.SENSORY_PREFERENCES).sort(), FAMILIES.slice().sort());
  assert.equal(topology.selectTopology(topologyInput('security')).topology, 'trinity');
  assert.equal(topology.selectTopology(topologyInput('metabolic')).topology, 'biome');
  assert.equal(topology.selectTopology(topologyInput('deep_research')).topology, 'rhizome');

  const view = await control.getStatusView(db, { projectId });
  assert.equal(view.sensory.available, true);
  assert.equal(view.sensory.daemonLive, true);
  assert.deepEqual(view.sensory.activePhenotypes, ['security']);
  assert.equal(view.sensory.findings, 1);

  const pausedId = await store.createProject(db, {
    id: 'onto-sensory-paused', rootPath: ROOT, branch: 'codex/sensory-paused', objective: 'wait safely'
  });
  await db.run("UPDATE ontogenesis_projects SET state = 'PAUSED' WHERE id = ?", [pausedId]);
  await db.run("UPDATE ontogenesis_control SET mode = 'paused' WHERE project_id = ?", [pausedId]);
  const paused = await tickOnce(db, { projectId: pausedId, owner: 'sensory-test' });
  assert.equal(paused.state, 'PAUSED');
  const tickEvent = await db.get(
    "SELECT payload_json FROM ontogenesis_events WHERE project_id = ? AND id LIKE 'sensory_%'",
    [pausedId]
  );
  assert.equal(JSON.parse(tickEvent.payload_json).source, 'resident_daemon');

  await db.close();
  console.log('Ontogenesis daemon sensory system tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
