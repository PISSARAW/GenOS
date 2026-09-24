'use strict';

const assert = require('node:assert/strict');
const reconciler = require('../src/services/daemon/reconciliation/reconcilerService');
const suspects = require('../src/services/daemon/reconciliation/suspectService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const repairService = require('../src/services/daemon/repair/repairEpisodeService');
const compiler = require('../src/services/daemon/handoff/handoffCompilerService');
const { migrateTerritoryGraph } = require('../src/db/migrations/migrateTerritoryGraph');

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const T = 'territory.reconcile-x';
const OLD = '2000-01-01T00:00:00Z';

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

async function makeTerritory(db, id) {
  await territoryService.createTerritory(db, {
    id,
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: id,
    rootPath: `/tmp/${id}`,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
}

async function makeRepairableFinding(db, id) {
  await findingService.createFinding(db, {
    id,
    territoryId: T,
    claim: `extended reconciler probe claim with enough words ${id}`,
    scope: { type: 'file', value: 'probe.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  for (const toStatus of ['SUPPORTED', 'REPRODUCED', 'CAUSALLY_SUPPORTED', 'REPAIRABLE']) {
    await findingService.transitionFinding(db, { id, toStatus });
  }
}

async function makeCoreTables(db) {
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, runtime_pid INTEGER,
    runtime_started_at TEXT, workspace_id TEXT, updated_at TEXT)`);
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, is_archived INTEGER DEFAULT 0, updated_at TEXT)`);
}

async function main() {
  const db = await openDb();
  await makeTerritory(db, T);

  // 1. Épisode OPEN dont le finding est réfuté → EXPIRED (liveness définitivement morte).
  await makeRepairableFinding(db, 'finding.rec-orphan');
  await repairService.openEpisode(db, { findingId: 'finding.rec-orphan', createdBy: 'daemon.resident-1' });
  await db.run("UPDATE daemon_findings SET status = 'REFUTED' WHERE id = 'finding.rec-orphan'");

  // 2. Brief READY sur HEAD dépassé → EXPIRED (dossier conservé, plus servi).
  await compiler.compileBrief(db, { territoryId: T });
  await territoryService.updateHead(db, { id: T, headSha: HEAD_B });

  // 3. Arête pendante (cible manquante) → purgée, le graphe est un index dérivé.
  await migrateTerritoryGraph(db);
  await db.run(`INSERT INTO territory_graph_nodes (id, territory_id, kind, path)
    VALUES ('node.alive', ?, 'file', 'alive.js')`, T);
  await db.run(`INSERT INTO territory_graph_edges (id, territory_id, source_id, relation, target_id)
    VALUES ('edge.dangling', ?, 'node.alive', 'IMPORTS', 'node.ghost')`, T);

  const receipt = await reconciler.sweep(db, { territoryId: T });
  assert.equal(receipt.swept, true);
  assert.equal(receipt.expiredOrphanEpisodes, 1);
  assert.equal(receipt.expiredStaleBriefs, 1);
  assert.equal(receipt.prunedDanglingEdges, 1);
  const episode = await repairService.getEpisode(db, { id: 'repair.rec-orphan' });
  assert.equal(episode.episode.status, 'EXPIRED');
  const briefs = await db.all("SELECT status FROM daemon_handoffs WHERE territory_id = ?", T);
  assert.ok(briefs.every((b) => b.status === 'EXPIRED'));
  const edges = await db.all('SELECT id FROM territory_graph_edges');
  assert.equal(edges.length, 0);

  // 4. Suspects : ressources étrangères fichées, jamais mutées.
  await makeCoreTables(db);
  await db.run(`INSERT INTO agents (id, status, runtime_pid, workspace_id, updated_at)
    VALUES ('agent.blocked-1', 'blocked', NULL, NULL, '${OLD}')`);
  await db.run(`INSERT INTO agents (id, status, runtime_pid, workspace_id, updated_at)
    VALUES ('agent.zombie-1', 'completed', 4242, NULL, '${OLD}')`);
  await db.run(`INSERT INTO workspaces (id, is_archived, updated_at)
    VALUES ('ws.orphan-1', 0, '${OLD}')`);
  const first = await reconciler.sweep(db, { territoryId: T });
  assert.equal(first.newSuspects, 3);
  assert.equal(first.pendingSuspects, 3);
  assert.equal(first.resolvedSuspects, 0);
  const rows = await suspects.listSuspects(db, { territoryId: T, status: 'SUSPECT' });
  assert.equal(rows.length, 3);
  const agentsLeft = await db.all('SELECT id, status FROM agents');
  assert.equal(agentsLeft.length, 2, 'suspects are filed, never mutated');

  // 5. Ressource revenue à la vie → RESOLVED ; recommencer → idempotent.
  await db.run("UPDATE agents SET status = 'completed', runtime_pid = NULL, updated_at = datetime('now') WHERE id = 'agent.blocked-1'");
  await db.run("UPDATE agents SET status = 'running', runtime_pid = 4242, updated_at = datetime('now') WHERE id = 'agent.zombie-1'");
  const second = await reconciler.sweep(db, { territoryId: T });
  assert.equal(second.newSuspects, 0);
  assert.equal(second.resolvedSuspects, 2);
  assert.equal(second.pendingSuspects, 1);
  const third = await reconciler.sweep(db, { territoryId: T });
  assert.equal(third.newSuspects, 0);
  assert.equal(third.resolvedSuspects, 0);

  // 6. Branche abandonnée : épisode FAILED ancien → suspect (git = owner).
  await makeRepairableFinding(db, 'finding.rec-failed');
  await repairService.openEpisode(db, { findingId: 'finding.rec-failed', createdBy: 'daemon.resident-1' });
  await repairService.claimEpisode(db, { id: 'repair.rec-failed', workerId: 'worker.1' });
  await repairService.closeEpisode(db, { id: 'repair.rec-failed', toStatus: 'FAILED' });
  await db.run(`UPDATE daemon_repair_episodes SET updated_at = '${OLD}' WHERE id = 'repair.rec-failed'`);
  const fourth = await reconciler.sweep(db, { territoryId: T });
  assert.equal(fourth.newSuspects, 1);
  const abandoned = await suspects.listSuspects(db, { territoryId: T, status: 'SUSPECT' });
  assert.ok(abandoned.some((s) => s.kind === 'abandoned-branch'));

  // 7. Tables absentes : gardes douces, zéro throw, compteurs à 0.
  const bare = await openDb();
  await makeTerritory(bare, 'territory.bare');
  const bareReceipt = await reconciler.sweep(bare, { territoryId: 'territory.bare' });
  assert.equal(bareReceipt.swept, true);
  assert.equal(bareReceipt.expiredOrphanEpisodes, 0);
  assert.equal(bareReceipt.prunedDanglingEdges, 0);
  assert.equal(bareReceipt.newSuspects, 0);

  await db.close();
  await bare.close();
  console.log('Daemon extended reconciler tests passed (orphan episodes, stale briefs, dangling edges, suspects, guards).');
}

main().catch((error) => { console.error(error); process.exit(1); });
