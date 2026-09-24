const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const hook = require('../src/services/morphogenesis/autoReevaluationHook');
const { executeReevaluation } = require('../src/services/morphogenesis/dynamicReevaluationExecutorService');
const { getState } = require('../src/services/collectiveStateService');

async function run() {
  // 1. Kill-switch : désactivé sans db, ne fait rien et ne lève jamais.
  process.env[hook.KILL_SWITCH_ENV] = '0';
  const disabled = await hook.maybeAutoReevaluate({ orchestratorId: 'x' });
  assert.equal(disabled.evaluated, false);
  assert.equal(disabled.reason, 'disabled');
  delete process.env[hook.KILL_SWITCH_ENV];

  // 2. Contexte invalide : ne lève jamais.
  const invalid = await hook.maybeAutoReevaluate({});
  assert.equal(invalid.evaluated, false);
  assert.equal(invalid.reason, 'invalid_context');

  // 3. Chemin nominal sur DB réelle : transition réussie, regret sous le seuil.
  const dbPath = path.resolve(__dirname, 'morphogenesis-auto-reeval-test.db');
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
  const db = await getDatabase(dbPath);
  try {
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'counterfactual_%'"
    );
    assert.ok(tables.length >= 4, 'counterfactual tables must exist after migration 070');
    const calm = await hook.maybeAutoReevaluate({
      db,
      orchestratorId: 'reeval-test-orch',
      transition: { previous: 'team', organization: 'trinity', reason: 'test', changed: true },
    });
    assert.equal(calm.evaluated, false);
    assert.equal(calm.reason, 'below_threshold');

    // 4. Regret forcé (100% d'échecs) : lifecycle contrefactuel + plan + gate.
    const failedEvidence = [];
    for (let i = 0; i < 5; i++) failedEvidence.push({ status: 'failed', outcome: 'failure' });
    const t0 = Date.now();
    const triggered = await executeReevaluation({
      agentId: 'reeval-test-orch',
      evidence: failedEvidence,
      collectiveState: getState(),
      db,
    });
    const durationMs = Date.now() - t0;
    console.log(`triggered: ${JSON.stringify({ executed: triggered.executed, reason: triggered.reason, errors: triggered.errors, durationMs, hasPlan: Boolean(triggered.plan), worlds: triggered.counterfactualReceipt && triggered.counterfactualReceipt.worldsCreated })}`);
    assert.equal(triggered.executed, false);
    // Plan incomplet (aucun spawn à proposer) : le gate refuse, sans appliquer ni committer.
    assert.equal(triggered.reason, 'validation_failed');
    assert.ok(triggered.plan, 'a morphogenesis plan must be produced');
    assert.ok(
      triggered.errors && triggered.errors.includes('no spawn agents planned'),
      'gate must reject spawn-less plans'
    );
    assert.ok(triggered.counterfactualReceipt && triggered.counterfactualReceipt.executed, 'counterfactual lifecycle must run');
    assert.ok(triggered.counterfactualReceipt.worldsCreated > 0, 'worlds must be forked');
    assert.ok(durationMs < 60000, 'bounded experiment must stay under 60s');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    }
  }
  console.log('morphogenesis auto-reeval: PASS');
}

run().catch((e) => { console.error(e); process.exit(1); });
