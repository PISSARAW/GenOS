'use strict';

const assert = require('node:assert/strict');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');

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
  const T = 'territory.stig-test';

  // 1. Dépôt + renforcement cumulatif, plafonné
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY', intensity: 2 });
  const reinforced = await stigmergy.depositMarker(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY', intensity: 2.5 });
  assert.equal(reinforced.intensity, 4.5);
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY', intensity: 100 });
  assert.equal((await stigmergy.getMarker(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY' })).intensity, 10);

  // 2. Répulsif : réfutation fait chuter sous zéro, plancher -10
  await stigmergy.depositRepellent(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY', intensity: 6.2 });
  const repelled = await stigmergy.getMarker(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY' });
  assert.ok(Math.abs(repelled.intensity - 3.8) < 1e-9);

  // 3. Évaporation : decay puis purge du quasi-nul
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'tmp/scope', kind: 'HIGH_RISK', intensity: 0.06 });
  await stigmergy.evaporateMarkers(db, { territoryId: T, rate: 0.5 });
  const afterEvap = await stigmergy.getMarker(db, { territoryId: T, scope: 'tmp/scope', kind: 'HIGH_RISK' });
  assert.equal(afterEvap.deposited, false);
  const survivor = await stigmergy.getMarker(db, { territoryId: T, scope: 'backend/auth', kind: 'TEST_INSTABILITY' });
  assert.ok(Math.abs(survivor.intensity - 1.9) < 1e-9);

  // 4. Attention ordonnée par |intensité|, sans claim ni statut
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'backend/db', kind: 'DEAD_END', intensity: 6 });
  const attention = await stigmergy.readAttention(db, { territoryId: T });
  assert.ok(attention.length >= 2);
  assert.ok(Math.abs(attention[0].attention) >= Math.abs(attention[1].attention));
  for (const item of attention) {
    assert.deepEqual(Object.keys(item).sort(), ['attention', 'kind', 'scope']);
  }

  // 5. Kind invalide refusé
  assert.equal((await stigmergy.depositMarker(db, { territoryId: T, scope: 'x', kind: 'NOPE' })).deposited, false);

  // 6. Pont partagé : mapping honnête, PERFORMANCE_REGRESSION reste local
  const bridgeSignal = stigmergy.buildBridgeSignal({ territoryId: T, scope: 'backend/auth', kind: 'HIGH_RISK', intensity: 4 });
  assert.equal(bridgeSignal.type, 'epistemic_high_risk');
  assert.equal(bridgeSignal.locus, `territory:${T}:backend/auth`);
  assert.equal(bridgeSignal.isRepellent, false);
  const deadEnd = stigmergy.buildBridgeSignal({ territoryId: T, scope: 'backend/db', kind: 'DEAD_END', intensity: 6 });
  assert.equal(deadEnd.type, 'epistemic_known_failure');
  assert.equal(deadEnd.isRepellent, true);
  assert.equal(stigmergy.buildBridgeSignal({ territoryId: T, scope: 'x', kind: 'PERFORMANCE_REGRESSION' }), null);

  // 7. Forward échec-doux (bus en panne → pas de throw)
  const calls = [];
  const ok = await stigmergy.forwardToBridge({ depositPheromone: async (s) => calls.push(s) }, bridgeSignal);
  assert.equal(ok.forwarded, true);
  assert.equal(calls.length, 1);
  const ko = await stigmergy.forwardToBridge({ depositPheromone: async () => { throw new Error('bus down'); } }, bridgeSignal);
  assert.equal(ko.forwarded, false);

  await db.close();
  console.log('Daemon stigmergy tests passed (deposit, repellent, evaporation, attention, bridge).');
}

main().catch((error) => { console.error(error); process.exit(1); });
