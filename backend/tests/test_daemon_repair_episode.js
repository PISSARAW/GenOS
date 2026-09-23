'use strict';

const assert = require('node:assert/strict');
const repair = require('../src/services/daemon/repair/repairEpisodeService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const reconciler = require('../src/services/daemon/reconciliation/reconcilerService');

const HEAD_A = 'a'.repeat(40);
const T = 'territory.repair-test';

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

async function makeRepairable(db, id) {
  await findingService.createFinding(db, {
    id,
    territoryId: T,
    claim: `repair probe claim with enough words ${id}`,
    scope: { type: 'file', value: 'probe.js' },
    headSha: HEAD_A,
    status: 'OBSERVED',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  const chain = ['HYPOTHESIZED', 'SUPPORTED', 'REPRODUCED', 'CAUSALLY_SUPPORTED', 'REPAIRABLE'];
  for (const toStatus of chain) {
    const moved = await findingService.transitionFinding(db, { id, toStatus });
    assert.equal(moved.finding.status, toStatus);
  }
}

async function main() {
  const db = await openDb();
  const { migrateDaemonEvents } = require('../src/db/migrations/migrateDaemonEvents');
  const { migrateDaemonHandoffs } = require('../src/db/migrations/migrateDaemonHandoffs');
  const { migrateDaemonStigmergy } = require('../src/db/migrations/migrateDaemonStigmergy');
  await migrateDaemonEvents(db);
  await migrateDaemonHandoffs(db);
  await migrateDaemonStigmergy(db);
  await territoryService.createTerritory(db, {
    id: T,
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'repair-test',
    rootPath: '/tmp/repair-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });

  // 1. Ouverture sur finding REPAIRABLE : lease scopée, branche isolée
  await makeRepairable(db, 'finding.repair-ok');
  const opened = await repair.openEpisode(db, { findingId: 'finding.repair-ok', createdBy: 'daemon.resident-1' });
  assert.equal(opened.opened, true);
  assert.equal(opened.episode.status, 'OPEN');
  assert.equal(opened.episode.branchName, 'genos-repair/repair-ok');
  assert.equal(opened.episode.lease.findingId, 'finding.repair-ok');
  assert.ok(!opened.episode.lease.allowedCommands.includes('git_push'));
  assert.ok(!opened.episode.lease.allowedCommands.includes('merge'));

  // 2. Idempotence : même finding → même épisode, pas de doublon
  const again = await repair.openEpisode(db, { findingId: 'finding.repair-ok', createdBy: 'daemon.resident-1' });
  assert.equal(again.opened, true);
  assert.equal(again.episode.id, opened.episode.id);

  // 3. Refus si finding non REPAIRABLE
  await findingService.createFinding(db, {
    id: 'finding.repair-early',
    territoryId: T,
    claim: 'early probe claim with enough words here',
    scope: { type: 'file', value: 'early.js' },
    headSha: HEAD_A,
    status: 'OBSERVED',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  const refused = await repair.openEpisode(db, { findingId: 'finding.repair-early', createdBy: 'daemon.resident-1' });
  assert.equal(refused.opened, false);

  // 4. Refus si finding inconnu
  const unknown = await repair.openEpisode(db, { findingId: 'finding.repair-missing', createdBy: 'daemon.resident-1' });
  assert.equal(unknown.opened, false);

  // 5. Claim par worker puis clôture SUCCEEDED
  const claimed = await repair.claimEpisode(db, {
    id: opened.episode.id,
    workerId: 'worker.repair-1',
    workspacePath: '/tmp/genos-repair-repair-ok'
  });
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.episode.status, 'CLAIMED');
  assert.equal(claimed.episode.workerId, 'worker.repair-1');
  const closed = await repair.closeEpisode(db, { id: opened.episode.id, toStatus: 'SUCCEEDED' });
  assert.equal(closed.closed, true);
  assert.equal(closed.episode.status, 'SUCCEEDED');

  // 6. Double claim sur épisode clos → refus
  const reclaim = await repair.claimEpisode(db, { id: opened.episode.id, workerId: 'worker.repair-2' });
  assert.equal(reclaim.claimed, false);

  // 7. Expiration via reconciler : épisode périmé → EXPIRED
  await makeRepairable(db, 'finding.repair-old');
  const old = await repair.openEpisode(db, { findingId: 'finding.repair-old', createdBy: 'daemon.resident-1' });
  await db.run("UPDATE daemon_repair_episodes SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", old.episode.id);
  const receipt = await reconciler.sweep(db, { territoryId: T });
  assert.equal(receipt.expiredRepairs, 1);
  assert.equal((await repair.getEpisode(db, { id: old.episode.id })).episode.status, 'EXPIRED');

  // 8. Second sweep : idempotent
  const idle = await reconciler.sweep(db, { territoryId: T });
  assert.equal(idle.expiredRepairs, 0);

  await db.close();
  console.log('Daemon repair episode tests passed (lease scoped, worker-executed, reconciled).');
}

main().catch((error) => { console.error(error); process.exit(1); });
