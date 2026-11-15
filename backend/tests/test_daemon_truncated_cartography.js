'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cartographer = require('../src/services/daemon/cartography/cartographerService');
const cycle = require('../src/services/daemon/residentDaemonCycleService');
const territories = require('../src/services/daemon/daemonTerritoryService');

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  return sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
}

function writeFiles(root) {
  for (let index = 0; index <= cartographer.MAX_FILES; index += 1) {
    fs.writeFileSync(path.join(root, `file-${index}.txt`), String(index));
  }
}

async function main() {
  const db = await openDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-carto-truncated-'));
  try {
    writeFiles(root);
    await territories.createTerritory(db, {
      id: 'territory.truncated-index', organizationId: 'org-test', projectId: 'project-test',
      workspaceId: 'workspace-test', repoIdentity: 'truncated-index', rootPath: root,
      headSha: 'a'.repeat(40)
    });
    const result = await cartographer.scanTerritory(db, {
      territoryId: 'territory.truncated-index', rootPath: root, scopePath: '/'
    });
    const stored = await territories.getTerritory(db, { id: 'territory.truncated-index' });
    assert.equal(result.truncated, true);
    assert.equal(stored.territory.state, 'DEGRADED');
    assert.equal(stored.territory.indexedHeadSha, null);
    assert.ok(stored.territory.lastIndexedAt);
    assert.equal(cycle.needsIndexRefresh(stored.territory), false);
    assert.equal(cycle.needsIndexRefresh({ ...stored.territory, state: 'STALE' }), true);
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
