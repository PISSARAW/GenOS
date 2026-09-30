'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const memory = require('../src/services/epistemic/immuneMemoryService');
const repository = require('../src/services/epistemic/immuneMemoryRepository');

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'test-admin-password-aeis-memory';
  const dbPath = path.join(os.tmpdir(), `aeis-memory-${process.pid}.db`);
  const db = await getDatabase(dbPath);
  try {
    const antigen = { claim: 'expired token is rejected', domain: 'auth' };
    const entries = [];
    memory.recordOutcome(entries, antigen, { domain: 'auth', outcome: 'pending' });
    await repository.save(db, entries);
    const reloaded = await repository.load(db);
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].pending, true);
    assert.equal(reloaded[0].affinity, 0.4);
    memory.recordOutcome(reloaded, antigen, { outcome: 'success' });
    await repository.save(db, reloaded);
    const resolved = await repository.load(db);
    assert.equal(resolved[0].pending, false);
    assert.equal(resolved[0].successes, 1);
    assert.equal(resolved[0].affinity, 1);
    console.log('AEIS immune memory persists pending and oracle-resolved outcomes.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
