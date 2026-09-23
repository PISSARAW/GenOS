'use strict';

const assert = require('node:assert/strict');
const interoception = require('../src/services/daemon/daemonTerritoryInteroceptionService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
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

async function main() {
  const db = await openDb();
  await makeTerritory(db, 'territory.intero-fresh');
  await makeTerritory(db, 'territory.intero-busy');

  // 1. Territoire frais, journal vide : pressions nulles, staleness basse
  const fresh = await interoception.senseTerritory(db, 'territory.intero-fresh', {});
  assert.equal(fresh.variables.change_rate, 0);
  assert.equal(fresh.variables.test_failure_pressure, 0);
  assert.ok(fresh.variables.knowledge_staleness < 0.1);
  assert.ok(fresh.measured.includes('change_rate'));

  // 2. Pas de valeurs fantômes : le différé est déclaré, pas mesuré
  assert.ok(fresh.deferred.includes('graph_coverage'));
  assert.ok(fresh.deferred.includes('unresolved_findings'));
  assert.ok(!('graph_coverage' in fresh.variables));

  // 3. Le bridge journalise : 3 commits + 2 TEST_FAILED
  const bridge = bridgeService.createBridge({ db });
  const now = Date.now();
  await bridgeService.ingestEvent(bridge, { type: 'TERRITORY_COMMIT', territoryId: 'territory.intero-busy', headSha: HEAD_A, now });
  await bridgeService.ingestEvent(bridge, { type: 'TERRITORY_FILE_CHANGED', territoryId: 'territory.intero-busy', now });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.intero-busy', now });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.intero-busy', now: now + 6000 });
  const rows = await db.all('SELECT COUNT(*) as n FROM daemon_events WHERE territory_id = ?', 'territory.intero-busy');
  assert.equal(rows[0].n, 4);

  // 4. L'interoception dérive les pressions du journal
  const busy = await interoception.senseTerritory(db, 'territory.intero-busy', { now: now + 7000 });
  assert.ok(busy.variables.change_rate > 0);
  assert.ok(busy.variables.test_failure_pressure > 0);
  assert.equal(busy.variables.build_failure_pressure, 0);

  // 5. Territoire abandonné : staleness → 1
  await db.run("UPDATE daemon_territories SET last_observed_at = '2000-01-01T00:00:00Z' WHERE id = ?", 'territory.intero-fresh');
  const stale = await interoception.senseTerritory(db, 'territory.intero-fresh', {});
  assert.equal(stale.variables.knowledge_staleness, 1);

  // 6. Homéostasie : territoire agité + machine calme → cartographie, pas de defer
  const calmMachine = { stress: 0.1, context_pressure: 0.2, model_drift: 0.0 };
  const pressured = interoception.combinePressures(busy.variables, calmMachine);
  assert.ok(pressured.cartographyPressure > 0);
  assert.equal(pressured.deferReasoning, false);
  assert.ok(pressured.wakeUrgency > 0);

  // 7. Machine stressée → defer raisonnement coûteux (même si territoire agité)
  const stressedMachine = { stress: 0.9, context_pressure: 0.2, model_drift: 0.0 };
  const deferred = interoception.combinePressures(busy.variables, stressedMachine);
  assert.equal(deferred.deferReasoning, true);
  assert.ok(deferred.cartographyPressure > 0);

  // 8. Territoire inconnu : staleness maximale, pas de throw
  const ghost = await interoception.senseTerritory(db, 'territory.ghost', {});
  assert.equal(ghost.variables.knowledge_staleness, 1);

  await db.close();
  console.log('Daemon territory interoception tests passed (measured vars, staleness, homeostasis combine).');
}

main().catch((error) => { console.error(error); process.exit(1); });
