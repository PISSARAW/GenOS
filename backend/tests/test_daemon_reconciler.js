'use strict';

const assert = require('node:assert/strict');
const reconciler = require('../src/services/daemon/reconciliation/reconcilerService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
const compiler = require('../src/services/daemon/handoff/handoffCompilerService');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');

const HEAD_A = 'a'.repeat(40);
const T = 'territory.reconcile-test';

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
    claim: `reconciler probe claim with enough words ${spec.id}`,
    scope: { type: 'file', value: 'probe.js' },
    headSha: HEAD_A,
    status: spec.status || 'HYPOTHESIZED',
    createdBy: 'daemon.resident-1',
    limitations: ['probe'],
    expiresAt: spec.expiresAt || null
  });
}

async function main() {
  const db = await openDb();
  await territoryService.createTerritory(db, {
    id: T,
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'reconcile-test',
    rootPath: '/tmp/reconcile-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });

  // 1. Expiré déclaré → EXPIRED ; réfuté expiré → intact ; sans expiry → intact
  await makeFinding(db, { id: 'finding.rec-expired', expiresAt: '2000-01-01T00:00:00Z' });
  await makeFinding(db, { id: 'finding.rec-refuted', status: 'HYPOTHESIZED', expiresAt: '2000-01-01T00:00:00Z' });
  await findingService.transitionFinding(db, { id: 'finding.rec-refuted', toStatus: 'REFUTED' });
  await makeFinding(db, { id: 'finding.rec-fresh' });

  // 2. Journal : un vieil event à purger, un récent à garder
  const bridge = bridgeService.createBridge({ db });
  await bridgeService.ingestEvent(bridge, { type: 'AGENT_COMPLETED', territoryId: T });
  await db.run("UPDATE daemon_events SET created_at = '2000-01-01T00:00:00Z' WHERE id = 1");

  // 3. Handoff READY périmé → EXPIRED ; CONSUMED intact
  const brief = await compiler.compileBrief(db, { territoryId: T });
  await db.run("UPDATE daemon_handoffs SET created_at = '2000-01-01T00:00:00Z' WHERE id = ?", brief.brief.briefId);

  // 4. Marqueur quasi-nul à évaporer
  await stigmergy.depositMarker(db, { territoryId: T, scope: 'dust', kind: 'HIGH_RISK', intensity: 0.06 });

  const receipt = await reconciler.sweep(db, { territoryId: T });
  assert.equal(receipt.swept, true);
  assert.equal(receipt.expiredFindings, 1);
  assert.equal(receipt.prunedEvents, 1);
  assert.equal(receipt.expiredHandoffs, 1);
  assert.equal(receipt.evaporatedMarkers, 1);

  assert.equal((await findingService.getFinding(db, { id: 'finding.rec-expired' })).finding.status, 'EXPIRED');
  assert.equal((await findingService.getFinding(db, { id: 'finding.rec-refuted' })).finding.status, 'REFUTED');
  assert.equal((await findingService.getFinding(db, { id: 'finding.rec-fresh' })).finding.status, 'HYPOTHESIZED');
  const kept = await db.all('SELECT id FROM daemon_events');
  assert.equal(kept.length, 0);

  // 5. Second sweep : idempotent, rien à faire
  const again = await reconciler.sweep(db, { territoryId: T });
  assert.equal(again.expiredFindings, 0);
  assert.equal(again.prunedEvents, 0);

  // 6. Sans territoire : échec doux
  assert.equal((await reconciler.sweep(db, {})).swept, false);

  await db.close();
  console.log('Daemon reconciler tests passed (expiry respected, retention, idempotent).');
}

main().catch((error) => { console.error(error); process.exit(1); });
