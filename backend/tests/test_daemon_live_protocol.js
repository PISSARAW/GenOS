'use strict';

const assert = require('node:assert/strict');
const live = require('../src/services/daemon/evaluation/liveProtocolRunner');
const territoryService = require('../src/services/daemon/daemonTerritoryService');

const HEAD_A = 'a'.repeat(40);

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

function stubExecutor(outcomes) {
  return async (job) => outcomes[job.arm];
}

async function liveRows(db) {
  return db.all("SELECT * FROM daemon_eval_runs WHERE kind = 'live-protocol'");
}

async function main() {
  const db = await openDb();
  await makeTerritory(db, 'territory.live-cold');
  await makeTerritory(db, 'territory.live-warm');

  // 1. Sans exécuteur : refus honnête, zéro ligne — jamais de succès simulé.
  const refused = await live.runLiveProtocol(db, {
    coldTerritoryId: 'territory.live-cold',
    warmTerritoryId: 'territory.live-warm',
    mission: 'probe mission'
  });
  assert.equal(refused.ran, false);
  assert.equal(refused.reason, 'no-live-executor');
  const empty = await live.liveEvidence(db, {});
  assert.equal(empty.executed, false);
  assert.equal(empty.runs.length, 0);

  // 2. Exécuteur injecté (déterministe ici, LLM en prod) : 3 bras persistés.
  const ran = await live.runLiveProtocol(db, {
    coldTerritoryId: 'territory.live-cold',
    warmTerritoryId: 'territory.live-warm',
    mission: 'probe mission',
    executor: stubExecutor({
      A: { taskSuccess: false, correctLocalization: false, tokensUsed: 1000, toolCallsUsed: 20, filesOpened: 15 },
      B: { taskSuccess: false, correctLocalization: true, tokensUsed: 800, toolCallsUsed: 14, filesOpened: 9 },
      C: { taskSuccess: true, correctLocalization: true, tokensUsed: 400, toolCallsUsed: 6, filesOpened: 3 }
    })
  });
  assert.equal(ran.ran, true);
  assert.equal(ran.arms.length, 3);
  assert.ok(ran.arms.every((a) => a.ran));
  assert.equal(ran.verdict.warmSolved, true);
  assert.equal(ran.verdict.coldSolved, false);
  assert.equal(ran.verdict.warmBetterOrEqual, true);
  assert.equal(ran.verdict.tokenDeltaWarmVsCold, 600);
  const rows = await liveRows(db);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.head_sha === HEAD_A));
  const arms = rows.map((r) => r.arm).sort();
  assert.deepEqual(arms, ['A', 'B', 'C']);

  // 3. Preuve live consultable pour la promotion (jamais auto-accordée ici).
  const evidence = await live.liveEvidence(db, {});
  assert.equal(evidence.executed, true);
  assert.equal(evidence.runs.length, 3);

  // 4. Territoire inconnu : bras refusés (HEAD jamais deviné), aucun verdict.
  // Les reçus par bras sont audités individuellement : seul C persiste.
  const beforeGhost = (await liveRows(db)).length;
  const ghost = await live.runLiveProtocol(db, {
    coldTerritoryId: 'territory.ghost',
    warmTerritoryId: 'territory.live-warm',
    mission: 'probe mission',
    executor: stubExecutor({ A: {}, B: {}, C: {} })
  });
  assert.equal(ghost.ran, false);
  assert.equal(ghost.reason, 'arm-failed');
  assert.equal(ghost.verdict, undefined);
  const ghostC = (await liveRows(db)).filter((r) => r.arm === 'C');
  assert.equal((await liveRows(db)).length, beforeGhost + 1, 'only the executed arm leaves a labeled receipt');
  assert.ok(ghostC.length >= 2);

  // 5. Args incomplets : échec doux.
  assert.equal((await live.runLiveProtocol(db, {})).ran, false);
  assert.equal((await live.runLiveProtocol(null, {})).ran, false);

  await db.close();
  console.log('Daemon live protocol tests passed (honest refusal, 3 persisted arms, verdict math).');
}

main().catch((error) => { console.error(error); process.exit(1); });
