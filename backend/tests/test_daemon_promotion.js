'use strict';

const assert = require('node:assert/strict');
const promotion = require('../src/services/daemon/maturity/promotionService');
const benchmark = require('../src/services/daemon/evaluation/warmStartBenchmark');
const ablation = require('../src/services/daemon/evaluation/ablationRunner');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');
const liveProtocol = require('../src/services/daemon/evaluation/liveProtocolRunner');

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

async function seedWarmTerritory(db, id, n) {
  await makeTerritory(db, id);
  for (let i = 0; i < n; i += 1) {
    await findingService.createFinding(db, {
      id: `finding.promo-${id.slice(-4)}-${i}`,
      territoryId: id,
      claim: `promotion probe claim number ${i} about auth module`,
      scope: { type: 'file', value: 'auth.js' },
      headSha: HEAD_A,
      status: 'HYPOTHESIZED',
      detectorId: 'broken-import',
      createdBy: 'daemon.resident-1',
      limitations: ['probe']
    });
  }
  await stigmergy.depositMarker(db, { territoryId: id, scope: 'auth', kind: 'HIGH_RISK', intensity: 3 });
}

async function main() {
  // 1. Sans preuves : EXPERIMENTAL avec bloqueurs, reçu persisté.
  const empty = await openDb();
  const denied = await promotion.evaluateMaturity(empty, { suitesGreen: true });
  assert.equal(denied.maturity, 'EXPERIMENTAL');
  assert.ok(denied.reasons.length > 0, 'blockers listed');
  assert.ok(denied.reasons.join(' ').includes('warm-start pairs'));
  assert.ok(denied.reasons.join(' ').includes('complete live protocols'));
  assert.equal((await promotion.listPromotions(empty)).length, 1);
  await empty.close();

  // 2. Preuves suffisantes : 3 paires warm, ablations FULL-dominées, suites vertes → STABLE.
  const db = await openDb();
  for (let r = 0; r < 3; r += 1) {
    await makeTerritory(db, `territory.promo-cold-${r}`);
    await seedWarmTerritory(db, `territory.promo-warm-${r}`, 2);
    const res = await benchmark.runComparison(db, {
      coldTerritoryId: `territory.promo-cold-${r}`,
      warmTerritoryId: `territory.promo-warm-${r}`,
      mission: 'fix auth module'
    });
    assert.equal(res.compared, true);
  }
  const abl = await ablation.runAblations(db, { territoryId: 'territory.promo-warm-0', mission: 'fix auth' });
  assert.equal(abl.ablated, true);

  // 3. Proxy evidence alone cannot promote: three complete live A/B/C triples are required.
  const proxyOnly = await promotion.evaluateMaturity(db, { suitesGreen: true });
  assert.equal(proxyOnly.maturity, 'EXPERIMENTAL');
  assert.ok(proxyOnly.reasons.join(' ').includes('complete live protocols'));
  for (let r = 0; r < 3; r += 1) {
    const run = await liveProtocol.runLiveProtocol(db, {
      coldTerritoryId: `territory.promo-cold-${r}`,
      warmTerritoryId: `territory.promo-warm-${r}`,
      mission: `live probe ${r}`,
      executor: async ({ arm }) => arm === 'C'
        ? { taskSuccess: true, correctLocalization: true, tokensUsed: 400 }
        : { taskSuccess: false, correctLocalization: false, tokensUsed: 1000 }
    });
    assert.equal(run.ran, true);
  }

  // 4. Three supported live triples plus proxy evidence can pass the technical gate.
  const granted = await promotion.evaluateMaturity(db, { suitesGreen: true });
  assert.equal(granted.maturity, 'STABLE', granted.reasons.join('; '));
  assert.deepEqual(granted.reasons, []);
  assert.ok(granted.evidence.meanRecallGain >= 1);
  assert.equal(granted.evidence.liveProtocols, 3);
  assert.equal(granted.evidence.liveBetterProtocols, 3);
  const receipts = await promotion.listPromotions(db);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[1].to_maturity, 'STABLE');

  // 5. Warm matching the raw digest while costing more is not daemon value-add.
  for (let r = 0; r < 6; r += 1) {
    await liveProtocol.runLiveProtocol(db, {
      coldTerritoryId: `territory.promo-cold-${r % 3}`,
      warmTerritoryId: `territory.promo-warm-${r % 3}`,
      mission: `negative value-add ${r}`,
      executor: async ({ arm }) => arm === 'A'
        ? { taskSuccess: false, correctLocalization: false, tokensUsed: 73 }
        : { taskSuccess: true, correctLocalization: true, tokensUsed: arm === 'B' ? 270 : 287 }
    });
  }
  const noValueAdd = await promotion.evaluateMaturity(db, { suitesGreen: true });
  assert.equal(noValueAdd.maturity, 'EXPERIMENTAL');
  assert.equal(noValueAdd.evidence.liveProtocols, 9);
  assert.equal(noValueAdd.evidence.liveBetterProtocols, 3);
  assert.equal(noValueAdd.evidence.liveBetterRate, 1 / 3);
  assert.ok(noValueAdd.reasons.some((reason) => reason.includes('live warm benefit rate')));

  // 6. Suites rouges → EXPERIMENTAL même avec le reste au vert.
  const red = await promotion.evaluateMaturity(db, { suitesGreen: false });
  assert.equal(red.maturity, 'EXPERIMENTAL');
  assert.ok(red.reasons.join(' ').includes('suites not green'));
  assert.equal((await promotion.listPromotions(db)).length, 4);

  await db.close();
  console.log('Daemon promotion tests passed (evidence-gated STABLE, blockers listed).');
}

main().catch((error) => { console.error(error); process.exit(1); });
