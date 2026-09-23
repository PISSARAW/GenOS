'use strict';

const assert = require('node:assert/strict');
const ablation = require('../src/services/daemon/evaluation/ablationRunner');
const benchmark = require('../src/services/daemon/evaluation/warmStartBenchmark');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');

const HEAD_A = 'a'.repeat(40);
const T = 'territory.ablation-test';

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
  await territoryService.createTerritory(db, {
    id: T,
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'ablation-test',
    rootPath: '/tmp/ablation-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  await findingService.createFinding(db, {
    id: 'finding.abl-live',
    territoryId: T,
    claim: 'ablation probe claim about live finding in auth',
    scope: { type: 'file', value: 'auth.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    detectorId: 'broken-import',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  await findingService.createFinding(db, {
    id: 'finding.abl-dead',
    territoryId: T,
    claim: 'ablation probe claim about refuted dead end in cache',
    scope: { type: 'file', value: 'cache.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    detectorId: 'test-regression',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  await findingService.transitionFinding(db, { id: 'finding.abl-dead', toStatus: 'REFUTED' });
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'auth', kind: 'HIGH_RISK', intensity: 4 });

  // 1. Les 6 bras sont mesurés et persistés.
  const res = await ablation.runAblations(db, { territoryId: T, mission: 'fix auth' });
  assert.equal(res.ablated, true);
  assert.deepEqual(res.table.map((r) => r.arm), ablation.ARMS);
  const byArm = {};
  res.table.forEach((r) => { byArm[r.arm] = r; });

  // 2. Chaque ablation dégrade ou égale FULL (jamais mieux).
  assert.ok(byArm['no-stigmergy'].metrics.attentionSignals === 0);
  assert.ok(byArm['no-negative-memory'].metrics.recalledDeadEnds === 0);
  assert.ok(byArm['raw-digest'].metrics.recalledFindings === 0);
  assert.ok(byArm['polling'].metrics.stalenessWarnings === 0);
  for (const row of res.table) {
    assert.ok(row.recallDelta <= 0, `${row.arm} must not beat FULL on recall`);
    assert.ok(row.deadEndDelta <= 0, `${row.arm} must not beat FULL on dead-ends`);
  }

  // 3. Bras persistés pour D20.
  const runs = await benchmark.listEvalRuns(db, { kind: 'ablation' });
  assert.equal(runs.length, 6);

  // 4. Territoire inconnu : échec doux.
  assert.equal((await ablation.runAblations(db, {})).ablated, false);

  await db.close();
  console.log('Daemon ablation tests passed (6 arms, FULL dominates, persisted).');
}

main().catch((error) => { console.error(error); process.exit(1); });
