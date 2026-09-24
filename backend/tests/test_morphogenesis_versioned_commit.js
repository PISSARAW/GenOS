const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const { executeVersionedTransition, getLineage } = require('../src/services/morphogenesis/morphogenesisGitService');
const { getState } = require('../src/services/collectiveStateService');

async function run() {
  const dbPath = path.resolve(__dirname, 'morphogenesis-versioned-test.db');
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('vtest','VTest','orchestrator','running','orchestrator')");
    const plan = { id: 'plan_v1', actions: [], targetOrganization: 'stigmergy', reason: 'versioned-commit-proof' };
    const first = await executeVersionedTransition({ plan, collectiveState: getState(), db, agentId: 'vtest' });
    assert.equal(first.receipt.committed, true);
    assert.ok(first.commit && first.commit.id, 'versioned commit must be created');
    const second = await executeVersionedTransition({
      plan: { id: 'plan_v2', actions: [], targetOrganization: 'stigmergy', reason: 'versioned-commit-proof-2' },
      collectiveState: getState(), db, agentId: 'vtest',
    });
    assert.ok(second.commit && second.commit.id, 'second versioned commit must be created');
    const lineage = await getLineage(db, 'vtest', {});
    assert.ok(lineage.length >= 2, 'lineage must chain commits');
    assert.equal(lineage[0].parentCommitId, first.commit.id, 'second commit parents the first');
    console.log('morphogenesis versioned commit: PASS');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
