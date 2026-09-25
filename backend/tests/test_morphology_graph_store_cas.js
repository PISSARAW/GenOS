'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'morphology-store-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const { createMorphologyGraphStore } = require('../src/services/morphogenesis/graph/morphologyGraphStore');

async function run() {
  const dbPath = path.resolve(__dirname, 'morphology-graph-cas-test.db');
  removeDatabaseFiles(dbPath);
  const db = await getDatabase(dbPath);
  try {
    const store = createMorphologyGraphStore({ db });
    const first = await store.commit({ graph: graph('cas-mission'), expectedVersion: 0, authorization: authorization() });
    assert.equal(first.version, 1);
    assert.equal(first.status, 'committed');
    assert.equal(first.parentVersion, null);
    const second = await store.commit({ graph: { ...graph('cas-mission'), graphId: first.graphId }, expectedVersion: 1, authorization: authorization() });
    assert.equal(second.version, 2);
    assert.equal(second.parentVersion, 1);
    await assert.rejects(
      store.commit({ graph: { ...graph('cas-mission'), graphId: first.graphId }, expectedVersion: 1, authorization: authorization() }),
      (error) => error.code === 'MORPHOLOGY_VERSION_CONFLICT'
    );
    await assert.rejects(store.commit({ graph: graph('unauthorized'), expectedVersion: 0, authorization: {} }), /Rust kernel APPLY/);
    await assert.rejects(store.save({ ...graph('bypass'), status: 'committed' }), /authorized versioned commit/);
    assert.deepEqual(await store.listVersions(first.graphId), [1, 2]);
    console.log('morphology graph CAS: PASS');
  } finally {
    await closeDatabase();
    removeDatabaseFiles(dbPath);
  }
}

function graph(missionId) {
  return {
    graphId: `graph:${missionId}`,
    missionId,
    rootNode: { kind: 'TOPOLOGY', topology: 'a_team', budget: {} }
  };
}

function authorization() {
  return {
    kernelDecision: { valid: true, decision: 'APPLY' },
    governance: { allowed: true }
  };
}

function removeDatabaseFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
