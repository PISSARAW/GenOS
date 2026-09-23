'use strict';

const assert = require('node:assert/strict');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const { migrateDaemonTerritory } = require('../src/db/migrations/migrateDaemonTerritory');

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);

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

function baseInput(id) {
  return {
    id,
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'github.com/genos/test',
    rootPath: '/tmp/genos-test',
    scopePath: 'backend/src/services/',
    ref: 'main',
    headSha: HEAD_A
  };
}

async function main() {
  const db = await openDb();

  // 1. Migration crée les deux tables
  await migrateDaemonTerritory(db);
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('daemon_territories', 'daemon_runtime_state')"
  );
  assert.equal(tables.length, 2);

  // 2. Validation rejette les entrées invalides
  const bad = territoryService.validateTerritoryInput({ id: 'bad!' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.includes('invalid-id'));
  const badSha = territoryService.validateTerritoryInput({ ...baseInput('territory.t1'), headSha: 'zzz' });
  assert.ok(badSha.errors.includes('invalid-headSha'));

  // 3. Création + lecture
  const created = await territoryService.createTerritory(db, baseInput('territory.genos-backend'));
  assert.equal(created.found, true);
  assert.equal(created.territory.scopePath, 'backend/src/services/');
  assert.equal(created.territory.headSha, HEAD_A);

  // 4. Scope normalisé (leading slash retiré, trailing slash garanti)
  const scoped = await territoryService.createTerritory(db, {
    ...baseInput('territory.genos-root'),
    scopePath: '/'
  });
  assert.equal(scoped.territory.scopePath, '/');

  // 5. Liste filtrée par workspace
  await territoryService.createTerritory(db, {
    ...baseInput('territory.other-ws'),
    workspaceId: 'ws-2'
  });
  const ws1 = await territoryService.listTerritories(db, { workspaceId: 'ws-1' });
  assert.equal(ws1.length, 2);
  assert.ok(ws1.every((t) => t.workspaceId === 'ws-1'));

  // 6. updateHead identique = no-op
  const noop = await territoryService.updateHead(db, { id: 'territory.genos-backend', headSha: HEAD_A });
  assert.equal(noop.updated, true);
  assert.equal(noop.changed, false);

  // 7. updateHead différent = changed + previousHead (base du STALE)
  const moved = await territoryService.updateHead(db, { id: 'territory.genos-backend', headSha: HEAD_B });
  assert.equal(moved.updated, true);
  assert.equal(moved.changed, true);
  assert.equal(moved.previousHead, HEAD_A);

  // 8. Commit-aware : finding sur ancien HEAD devient stale
  const after = await territoryService.getTerritory(db, { id: 'territory.genos-backend' });
  assert.equal(after.territory.headSha, HEAD_B);
  assert.equal(territoryService.isKnowledgeStale(after.territory, HEAD_A), true);
  assert.equal(territoryService.isKnowledgeStale(after.territory, HEAD_B), false);
  assert.equal(territoryService.isKnowledgeStale(null, HEAD_B), true);

  // 9. updateHead invalide rejeté
  const invalid = await territoryService.updateHead(db, { id: 'territory.genos-backend', headSha: 'nope' });
  assert.equal(invalid.updated, false);

  // 10. Hiérarchie parent/enfant acceptée
  const child = await territoryService.createTerritory(db, {
    ...baseInput('territory.genos-backend-services'),
    scopePath: 'backend/src/services/daemon/',
    parentTerritoryId: 'territory.genos-backend',
    headSha: HEAD_B
  });
  assert.equal(child.found, true);
  assert.equal(child.territory.parentTerritoryId, 'territory.genos-backend');

  await db.close();
  console.log('Daemon territory tests passed (migration, validation, CRUD, commit-aware staleness, hierarchy).');
}

main().catch((error) => { console.error(error); process.exit(1); });
