'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'morphogenesis-hysteresis-test';
const { getDatabase, closeDatabase, withTransaction } = require('../src/db');
const store = require('../src/services/morphogenesis/morphogenesisHysteresisStore');

const BASE = { organizationId: 'org-a', projectId: 'project-a', missionId: 'mission-a' };

function transition(baseVersion, budgetLeft) {
  return { schema: 'genos.morphogenesis-hysteresis-transition/v1', baseVersion,
    nextVersion: baseVersion + 1, budgetLeft };
}

async function runAssertions(db) {
  const initial = await store.load(db, BASE);
  assert.equal(initial.version, 0);
  assert.equal(initial.budgetLeft, 1);
  const committed = await store.commit({ db, ...BASE, transitionId: 'tx-1',
    transition: transition(0, 0.8), committedAtUnixMs: 1000 });
  assert.equal(committed.version, 1);
  assert.equal((await store.load(db, BASE)).budgetLeft, 0.8);
  await assert.rejects(store.commit({ db, ...BASE, transitionId: 'tx-increase',
    transition: transition(1, 0.9), committedAtUnixMs: 1001 }),
  error => error.code === 'MORPHOGENESIS_HYSTERESIS_CONFLICT');
  await assert.rejects(store.commit({ db, ...BASE, transitionId: 'tx-race',
    transition: transition(0, 0.7), committedAtUnixMs: 1001 }),
  error => error.code === 'MORPHOGENESIS_HYSTERESIS_CONFLICT');
  const other = await store.load(db, { ...BASE, missionId: 'mission-b' });
  assert.equal(other.version, 0);
  await assert.rejects(withTransaction(db, async () => {
    await store.commit({ db, ...BASE, transitionId: 'tx-rollback',
      transition: transition(1, 0.6), committedAtUnixMs: 1002 });
    throw new Error('force transaction rollback');
  }), /force transaction rollback/);
  assert.equal((await store.load(db, BASE)).version, 1);
}

async function main() {
  const dbPath = path.join(__dirname, `.morph-hysteresis-${crypto.randomUUID()}.db`);
  try {
    await runAssertions(await getDatabase(dbPath));
    console.log('scoped transactional morphogenesis hysteresis: PASS');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
