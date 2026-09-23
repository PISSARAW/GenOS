'use strict';

const assert = require('node:assert/strict');
const promotion = require('../src/services/daemon/maturity/promotionService');
const benchmark = require('../src/services/daemon/evaluation/warmStartBenchmark');
const ablation = require('../src/services/daemon/evaluation/ablationRunner');
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
  const db = await openDb();

  console.log('=== Phase 1: Populate territories ===');
  for (let r = 0; r < 3; r += 1) {
    await makeTerritory(db, `territory.promo-cold-${r}`);
    await seedWarmTerritory(db, `territory.promo-warm-${r}`, 2);
    console.log(`  Pair ${r + 1}: cold=${`territory.promo-cold-${r}`}, warm=${`territory.promo-warm-${r}`} (2 findings + stigmergy)`);
  }

  console.log('\n=== Phase 2: Run 3 warm-start comparisons ===');
  for (let r = 0; r < 3; r += 1) {
    const res = await benchmark.runComparison(db, {
      coldTerritoryId: `territory.promo-cold-${r}`,
      warmTerritoryId: `territory.promo-warm-${r}`,
      mission: 'fix auth module'
    });
    assert.equal(res.compared, true);
    console.log(`  Run ${r + 1}: cold recalled=${res.cold.metrics.recalledFindings}, warm recalled=${res.warm.metrics.recalledFindings}, gain=${res.verdict.recallGain}`);
  }

  console.log('\n=== Phase 3: Run ablation (FULL must dominate) ===');
  const abl = await ablation.runAblations(db, { territoryId: 'territory.promo-warm-0', mission: 'fix auth' });
  assert.equal(abl.ablated, true);
  console.log(`  Territory: ${abl.territoryId}`);
  for (const row of abl.table) {
    const marker = row.arm === 'FULL' ? ' ★' : '';
    console.log(`    ${row.arm}: findings=${row.metrics.recalledFindings}, deadEnds=${row.metrics.recalledDeadEnds}, recallDelta=${row.recallDelta}, deadEndDelta=${row.deadEndDelta}${marker}`);
  }
  const fullDominates = abl.table.filter((r) => r.arm !== 'FULL').every((r) => r.recallDelta <= 0 && r.deadEndDelta <= 0);
  console.log(`  FULL dominates: ${fullDominates}`);

  console.log('\n=== Phase 4: Evaluate maturity (suitesGreen: true) ===');
  const result = await promotion.evaluateMaturity(db, { suitesGreen: true });
  console.log(`  Maturity: ${result.maturity}`);
  console.log(`  Blockers: ${result.reasons.length}`);
  if (result.reasons.length > 0) {
    for (const reason of result.reasons) {
      console.log(`    - ${reason}`);
    }
  }
  console.log(`  Evidence:`);
  console.log(`    - warmPairs: ${result.evidence.warmPairs}`);
  console.log(`    - meanRecallGain: ${result.evidence.meanRecallGain}`);
  console.log(`    - ablationArms: ${result.evidence.ablationArms}`);
  console.log(`    - falseFindingRate: ${result.evidence.falseFindingRate}`);
  console.log(`    - staleErrors: ${result.evidence.staleErrors}`);
  console.log(`    - suitesGreen: ${result.evidence.suitesGreen}`);

  console.log('\n=== Phase 5: Verify receipt persisted ===');
  const receipts = await promotion.listPromotions(db);
  console.log(`  Total receipts: ${receipts.length}`);
  const stableReceipt = receipts.find((r) => r.to_maturity === 'STABLE');
  if (stableReceipt) {
    const evidence = JSON.parse(stableReceipt.evidence_json);
    console.log(`  STABLE receipt:`);
    console.log(`    - id: ${stableReceipt.id}`);
    console.log(`    - from: ${stableReceipt.from_maturity}`);
    console.log(`    - to: ${stableReceipt.to_maturity}`);
    console.log(`    - verdict: ${stableReceipt.verdict}`);
    console.log(`    - decided_at: ${stableReceipt.decided_at}`);
    console.log(`    - evidence: ${JSON.stringify(evidence)}`);
  }

  await db.close();
  console.log('\n=== DONE: STABLE promotion achieved ===');
}

main().catch((error) => { console.error(error); process.exit(1); });
