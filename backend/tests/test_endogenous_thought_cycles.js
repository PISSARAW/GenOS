'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const migration = require('../src/db/migrations/migrateEndogenousThoughtCycles');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE legacy_cycle (
      organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
      episode_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
      UNIQUE(organization_id, project_id, episode_id));
      INSERT INTO legacy_cycle VALUES ('org-a','project-a','episode-a','artifact-a');`);
    assert.equal(await migration.upgradeEpisodeMultiplicity(db, 'legacy_cycle'), true);
    assert.equal(await migration.upgradeEpisodeMultiplicity(db, 'legacy_cycle'), false);
    await db.run("INSERT INTO legacy_cycle VALUES ('org-a','project-a','episode-a','artifact-b')");
    const rows = await db.all('SELECT artifact_id FROM legacy_cycle ORDER BY artifact_id');
    assert.deepEqual(rows.map((row) => row.artifact_id), ['artifact-a', 'artifact-b']);
  } finally {
    await db.close();
  }
  console.log('ETT legacy schema multicycle migration checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
