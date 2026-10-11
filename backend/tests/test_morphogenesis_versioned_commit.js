const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'morphogenesis-transition-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const { executeVersionedTransition, commitTransition, getLineage } = require('../src/services/morphogenesis/morphogenesisGitService');
const { getState } = require('../src/services/collectiveStateService');

async function run() {
  const dbPath = path.join(os.tmpdir(), `morphogenesis-versioned-${crypto.randomUUID()}.db`);
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('vtest','VTest','orchestrator','running','orchestrator')");
    const plan = { id: 'plan_v1', actions: [], targetOrganization: 'stigmergy', reason: 'versioned-commit-proof' };
    const state = getState();
    const before = state.currentMorphologyVersion;
    const first = await executeVersionedTransition({ plan, collectiveState: state, db, agentId: 'vtest' });
    assert.equal(first.receipt.committed, false);
    assert.equal(first.receipt.code, 'MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE');
    assert.equal(first.commit, null);
    const second = await executeVersionedTransition({
      plan: { id: 'plan_v2', actions: [], targetOrganization: 'stigmergy', reason: 'versioned-commit-proof-2' },
      collectiveState: getState(), db, agentId: 'vtest',
      authorization: { kernelDecision: { valid: true, decision: 'APPLY' },
        governance: { allowed: true } }, transitionSnapshot: { restorable: true },
    });
    assert.equal(second.receipt.committed, false);
    assert.equal(second.receipt.code, 'MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE');
    assert.equal(second.commit, null);
    const lineage = await getLineage(db, 'vtest', {});
    assert.equal(lineage.length, 0, 'a rejected transition cannot produce an AgentGit lineage');
    assert.equal(state.currentMorphologyVersion, before);
    await assert.rejects(commitTransition(db, { agentId: 'vtest', plan,
      receipt: { committed: true } }), (error) => error.code === first.receipt.code);
    console.log('morphogenesis versioned transition authority refusal: PASS');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
