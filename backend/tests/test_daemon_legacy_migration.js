'use strict';

const assert = require('node:assert/strict');
const legacyMigration = require('../src/services/daemon/daemonLegacyMigration');

const HEAD = 'c'.repeat(40);

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

function defaults() {
  return { organizationId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1', defaultHeadSha: HEAD, ref: 'main' };
}

async function main() {
  const db = await openDb();

  // 1. Mapping statuts legacy → états territoire
  assert.equal(legacyMigration.mapLegacyStatus('watching'), 'ACTIVE');
  assert.equal(legacyMigration.mapLegacyStatus('fix_committed'), 'ACTIVE');
  assert.equal(legacyMigration.mapLegacyStatus('sync_conflict'), 'DEGRADED');
  assert.equal(legacyMigration.mapLegacyStatus('skipped'), 'DORMANT');
  assert.equal(legacyMigration.mapLegacyStatus('unknown-xyz'), 'DORMANT');

  // 2. Sanitization nom repo
  assert.equal(legacyMigration.sanitizeRepoName('/home/u/GenOS'), 'genos');
  assert.equal(legacyMigration.sanitizeRepoName('C:\\ws\\my.repo_2'), 'my-repo-2');

  // 3. Migration nominale de deux repos
  const legacy = {
    '/repos/GenOS': { branch: 'genos-daemon/GenOS', base: 'main', status: 'watching', commitsAheadOfBase: 0, updatedAt: '2026-01-01T00:00:00Z', history: [] },
    '/repos/other': { branch: 'genos-daemon/other', base: 'develop', status: 'sync_conflict', commitsAheadOfBase: 2, updatedAt: '2026-01-02T00:00:00Z', history: [] }
  };
  const result = await legacyMigration.migrateLegacyState(db, legacy, defaults());
  assert.equal(result.migrated, 2);
  assert.equal(result.skipped, 0);
  const rows = await db.all('SELECT id, ref, state FROM daemon_territories ORDER BY id ASC');
  assert.equal(rows.length, 2);
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get('territory.legacy-genos').state, 'ACTIVE');
  assert.equal(byId.get('territory.legacy-other').state, 'DEGRADED');
  assert.equal(byId.get('territory.legacy-other').ref, 'develop');

  // 4. Idempotence : rejouer ne duplique pas
  const replay = await legacyMigration.migrateLegacyState(db, legacy, defaults());
  assert.equal(replay.migrated, 2);
  const rowsAfter = await db.all('SELECT id FROM daemon_territories');
  assert.equal(rowsAfter.length, 2);

  // 5. Sans HEAD valide : tout est sauté, rien d'inventé
  const noHead = await legacyMigration.migrateLegacyState(db, legacy, { ...defaults(), defaultHeadSha: 'zzz' });
  assert.equal(noHead.migrated, 0);
  assert.equal(noHead.skipped, 2);

  // 6. Entrée malformée sautée
  const mixed = await legacyMigration.migrateLegacyState(db, { '/repos/bad': null }, defaults());
  assert.equal(mixed.migrated, 0);
  assert.equal(mixed.skipped, 1);

  await db.close();
  console.log('Daemon legacy migration tests passed (mapping, idempotence, no phantom HEAD).');
}

main().catch((error) => { console.error(error); process.exit(1); });
