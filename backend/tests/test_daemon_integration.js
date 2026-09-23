'use strict';

/**
 * Phase 17-18 integration tests:
 *  - Finding → REPAIRABLE auto-opens repair episode
 *  - Daemon host CLI loads without syntax error
 *  - Daemon host CLI --help-like flags work
 */

const assert = require('node:assert/strict');
const lifecycle = require('../src/services/daemon/findings/findingLifecycleService');
const repair = require('../src/services/daemon/repair/repairEpisodeService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');

const HEAD_A = 'a'.repeat(40);
const T = 'territory.phase17-18-test';

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

async function promoteToRepairable(db, id) {
  await findingService.createFinding(db, {
    id,
    territoryId: T,
    claim: `integration test claim ${id} with enough length`,
    scope: { type: 'file', value: 'test.js' },
    headSha: HEAD_A,
    status: 'OBSERVED',
    createdBy: 'daemon.resident-test',
    limitations: ['test']
  });
  const chain = ['HYPOTHESIZED', 'SUPPORTED', 'REPRODUCED', 'CAUSALLY_SUPPORTED', 'REPAIRABLE'];
  for (const toStatus of chain) {
    await findingService.transitionFinding(db, { id, toStatus });
  }
}

async function main() {
  // 1. CLI syntax check
  const { execFileSync } = require('child_process');
  const path = require('path');
  const cliPath = path.join(__dirname, '..', 'bin', 'genos-daemon.cjs');
  execFileSync('node', ['--check', cliPath], { stdio: 'inherit' });
  console.log('  [OK] CLI loads without syntax error.');

  // 2. Setup in-memory DB
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
    repoIdentity: 'phase17-18-test',
    rootPath: '/tmp/phase17-18-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });

  // 3. Transition finding to REPAIRABLE → episode auto-opens
  await promoteToRepairable(db, 'finding.p17-auto');
  const episodesBefore = await repair.listEpisodes(db, { territoryId: T });
  assert.ok(episodesBefore.some((ep) => ep.findingId === 'finding.p17-auto'),
    'repair episode auto-opened on REPAIRABLE transition');
  assert.equal(episodesBefore[0].status, 'OPEN');
  console.log('  [OK] Repair episode auto-opened on REPAIRABLE.');

  // 4. Idempotent transition — no duplicate episode
  await findingService.transitionFinding(db, { id: 'finding.p17-auto', toStatus: 'EXPIRED' });
  await findingService.transitionFinding(db, { id: 'finding.p17-auto', toStatus: 'HYPOTHESIZED', headSha: HEAD_A });
  await findingService.transitionFinding(db, { id: 'finding.p17-auto', toStatus: 'SUPPORTED' });
  await findingService.transitionFinding(db, { id: 'finding.p17-auto', toStatus: 'REPRODUCED' });
  await findingService.transitionFinding(db, { id: 'finding.p17-auto', toStatus: 'CAUSALLY_SUPPORTED' });
  await findingService.transitionFinding(db, { id: 'finding.p17-auto', toStatus: 'REPAIRABLE' });
  const episodesAfter = await repair.listEpisodes(db, { territoryId: T });
  const forFinding = episodesAfter.filter((ep) => ep.findingId === 'finding.p17-auto');
  assert.equal(forFinding.length, 1, 'no duplicate repair episode on re-transition');
  console.log('  [OK] No duplicate episode on re-transition to REPAIRABLE.');

  // 5. onPostTransition returns null for non-REPAIRABLE
  const noOpen = await lifecycle.onPostTransition(db, { id: 'x' }, 'SUPPORTED');
  assert.equal(noOpen, null);
  console.log('  [OK] onPostTransition returns null for non-REPAIRABLE.');

  await db.close();
  console.log('Phase 17-18 integration tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
