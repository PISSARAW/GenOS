'use strict';

const assert = require('node:assert/strict');
const phenotype = require('../src/services/daemon/specialization/phenotypeService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');

const HEAD_A = 'a'.repeat(40);
const T = 'territory.phenotype-test';

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

async function makeFinding(db, spec) {
  await findingService.createFinding(db, {
    id: spec.id,
    territoryId: T,
    claim: `phenotype probe claim with enough words ${spec.id}`,
    scope: { type: 'file', value: 'probe.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    detectorId: spec.detectorId,
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
}

async function main() {
  const db = await openDb();
  await territoryService.createTerritory(db, {
    id: T,
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'phenotype-test',
    rootPath: '/tmp/phenotype-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });

  // 1. Pressions : 2 broken-import → contract+dependency ; HIGH_RISK 7 → security.
  await makeFinding(db, { id: 'finding.ph-broken-1', detectorId: 'broken-import' });
  await makeFinding(db, { id: 'finding.ph-broken-2', detectorId: 'broken-import' });
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'auth', kind: 'HIGH_RISK', intensity: 7 });

  const measured = await phenotype.measureEcologicalPressure(db, { territoryId: T });
  assert.equal(measured.measured, true);
  assert.ok(measured.pressures.contract >= 0.6, 'contract pressure from broken imports');
  assert.ok(measured.pressures.dependency >= 0.6, 'dependency pressure from broken imports');
  assert.ok(measured.pressures.security >= 0.6, 'security pressure from HIGH_RISK');
  assert.ok(measured.pressures.documentation < 0.6, 'no documentation signal');

  // 2. Budding : 3 ACTIVE avec budded_at, documentation DORMANT.
  const assigned = await phenotype.assignPhenotypes(db, { territoryId: T });
  assert.equal(assigned.assigned, true);
  const byFamily = {};
  assigned.phenotypes.forEach((p) => { byFamily[p.family] = p; });
  assert.equal(byFamily.contract.status, 'ACTIVE');
  assert.equal(byFamily.security.status, 'ACTIVE');
  assert.equal(byFamily.documentation.status, 'DORMANT');
  assert.ok(byFamily.contract.budded, 'first activation buds');
  const steady = await phenotype.assignPhenotypes(db, { territoryId: T });
  assert.equal(steady.phenotypes.find((p) => p.family === 'contract').budded, false);
  const firstBudding = (await phenotype.getPhenotypes(db, { territoryId: T }))
    .find((row) => row.family === 'contract').budded_at;

  // 3. Findings STALE ne maintiennent pas de pression écologique.
  await db.run("UPDATE daemon_findings SET status = 'STALE' WHERE territory_id = ?", T);
  await db.run("DELETE FROM daemon_stigmergy_markers WHERE territory_id = ?", T);
  const stalePressure = await phenotype.measureEcologicalPressure(db, { territoryId: T });
  assert.ok(stalePressure.pressures.contract < 0.6);
  assert.ok(stalePressure.pressures.dependency < 0.6);

  // 4. Pression retombée → DORMANT, jamais supprimé, budded_at conservé.
  const dormant = await phenotype.assignPhenotypes(db, { territoryId: T });
  assert.ok(dormant.phenotypes.every((p) => p.status === 'DORMANT'));
  const rows = await phenotype.getPhenotypes(db, { territoryId: T });
  assert.equal(rows.length, 10, 'phenotypes persist, never deleted');
  const contract = rows.find((r) => r.family === 'contract');
  assert.equal(contract.budded_at, firstBudding, 'bud scar kept after dormancy');

  // 5. Réactivation : nouvel événement de budding, même cicatrice historique.
  await makeFinding(db, { id: 'finding.ph-broken-3', detectorId: 'broken-import' });
  await makeFinding(db, { id: 'finding.ph-broken-4', detectorId: 'broken-import' });
  const rebudded = await phenotype.assignPhenotypes(db, { territoryId: T });
  assert.equal(rebudded.phenotypes.find((p) => p.family === 'contract').budded, true);
  const returned = (await phenotype.getPhenotypes(db, { territoryId: T }))
    .find((row) => row.family === 'contract');
  assert.equal(returned.budded_at, firstBudding);

  // 6. Territoire inconnu : échec doux.
  assert.equal((await phenotype.measureEcologicalPressure(db, {})).measured, false);
  assert.equal((await phenotype.assignPhenotypes(db, {})).assigned, false);

  await db.close();
  console.log('Daemon phenotype tests passed (pressure-gated budding, dormancy, reversibility).');
}

main().catch((error) => { console.error(error); process.exit(1); });
