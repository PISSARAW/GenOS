'use strict';

const assert = require('node:assert/strict');
const benchmark = require('../src/services/daemon/evaluation/warmStartBenchmark');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');

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

async function seedWarm(db, territoryId) {
  await findingService.createFinding(db, {
    id: 'finding.warm-broken',
    territoryId,
    claim: 'warm probe claim about broken import in auth module',
    scope: { type: 'file', value: 'auth.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    detectorId: 'broken-import',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  await findingService.transitionFinding(db, { id: 'finding.warm-broken', toStatus: 'SUPPORTED' });
  await findingService.createFinding(db, {
    id: 'finding.warm-dead',
    territoryId,
    claim: 'warm probe claim about a dead end in cache module',
    scope: { type: 'file', value: 'cache.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    detectorId: 'test-regression',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  await findingService.transitionFinding(db, { id: 'finding.warm-dead', toStatus: 'REFUTED' });
  await stigmergy.depositMarker(db, { territoryId, scope: 'auth', kind: 'HIGH_RISK', intensity: 4 });
}

async function main() {
  const db = await openDb();
  await makeTerritory(db, 'territory.bench-cold');
  await makeTerritory(db, 'territory.bench-warm');
  await seedWarm(db, 'territory.bench-warm');

  // 1. Même mission, même HEAD : le bras warm rappelle plus.
  const res = await benchmark.runComparison(db, {
    coldTerritoryId: 'territory.bench-cold',
    warmTerritoryId: 'territory.bench-warm',
    mission: 'fix broken import in auth module'
  });
  assert.equal(res.compared, true);
  assert.equal(res.cold.metrics.recalledFindings, 0);
  assert.ok(res.warm.metrics.recalledFindings >= 1);
  assert.ok(res.warm.metrics.recalledDeadEnds >= 1, 'warm rappelle aussi les dead-ends');
  assert.ok(res.warm.metrics.attentionSignals >= 1, 'warm porte des signaux stigmergiques');
  assert.equal(res.verdict.warmBetterOrEqual, true);
  assert.ok(res.verdict.recallGain >= 1);

  // 2. Bras persistés pour D18/D20.
  const runs = await benchmark.listEvalRuns(db, { kind: 'warm-start' });
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((r) => r.arm).sort(), ['cold', 'warm']);

  // 3. Arguments manquants : échec doux.
  assert.equal((await benchmark.runComparison(db, {})).compared, false);

  await db.close();
  console.log('Daemon warm-start benchmark tests passed (warm recalls more, runs persisted).');
}

main().catch((error) => { console.error(error); process.exit(1); });
