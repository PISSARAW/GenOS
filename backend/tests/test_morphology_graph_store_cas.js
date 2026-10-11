'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'morphology-store-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const { createMorphologyGraphStore } = require('../src/services/morphogenesis/graph/morphologyGraphStore');

async function run() {
  const dbPath = path.join(os.tmpdir(), `morphology-graph-cas-${crypto.randomUUID()}.db`);
  removeDatabaseFiles(dbPath);
  const db = await getDatabase(dbPath);
  try {
    const store = createMorphologyGraphStore({ db });
    const first = await store.save({ ...graph('cas-mission'), version: 1 });
    assert.equal(first.version, 1);
    assert.equal(first.status, 'proposed');
    assert.equal(first.parentVersion, null);
    const second = await store.save({ ...graph('cas-mission'), graphId: first.graphId,
      version: 2, parentVersion: 1 });
    assert.equal(second.version, 2);
    assert.equal(second.parentVersion, 1);
    await assert.rejects(
      store.commit({ graph: { ...graph('cas-mission'), graphId: first.graphId }, expectedVersion: 1, authorization: authorization() }),
      (error) => error.code === 'MORPHOLOGY_COMMIT_PROOF_UNAVAILABLE'
    );
    await assert.rejects(store.commit({ graph: graph('unauthorized'), expectedVersion: 0,
      authorization: {} }), /verified authority/);
    await assert.rejects(store.save({ ...graph('bypass'), status: 'committed' }), /Only proposed/);
    await assert.rejects(store.save({ ...graph('bypass'), status: 'applied' }), /Only proposed/);
    await assert.rejects(store.save({ ...graph('cas-mission'), graphId: first.graphId,
      version: 2 }), /monotonically/);
    assert.deepEqual(await store.listVersions(first.graphId), [1, 2]);
    const committed = await db.get("SELECT COUNT(*) AS count FROM morphology_graph_versions WHERE status = 'committed'");
    assert.equal(committed.count, 0);
    console.log('morphology graph proposed versioning and commit refusal: PASS');
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
