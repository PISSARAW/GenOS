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
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'test-secret-aeis-memory';
  const dbPath = path.join(os.tmpdir(), `aeis-memory-${process.pid}.db`);
  const db = await getDatabase(dbPath);
  try {
    const antigen = { claim: 'expired token is rejected', domain: 'auth' };
    const entries = [];
    memory.recordOutcome(entries, antigen, { domain: 'auth', outcome: 'pending' });
    await repository.save(db, entries, 'tenant-a:project-a:workspace-a');
    const reloaded = await repository.load(db, 'tenant-a:project-a:workspace-a');
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].pending, true);
    assert.equal(reloaded[0].affinity, 0.4);
    assert.equal((await repository.load(db, 'tenant-b:project-a:workspace-a')).length, 0);
    await assert.rejects(repository.resolve(db, {
      scopeId: 'tenant-a:project-a:workspace-a', signature: reloaded[0].signature,
      runId: 'unproven', resultId: 'unproven', assemblyId: 'missing',
    }), /assembly not found/);
    assert.equal((await repository.load(db, 'tenant-a:project-a:workspace-a'))[0].successes, 0);
    const report = { claims: [{ statement: 'echo 5 outputs "4"',
      test: { command: 'echo 5', expectOutput: '4' }, evidence: [{ kind: 'reproducible_artifact' }] }] };
    const exposure = [];
    const bridge = require('../src/services/epistemic/aeisPromotionBridge');
    const checked = await bridge.evaluateReportWithAeis(report, { db, immuneMemory: exposure,
      scopeId: 'tenant-a:project-a:workspace-a', runId: 'refuted-run' });
    await repository.save(db, exposure, 'tenant-a:project-a:workspace-a');
    const refutedAntigen = bridge.extractAntigensFromReport(report)[0];
    assert.equal(await repository.resolve(db, {
      scopeId: 'tenant-a:project-a:workspace-a', signature: memory.signatureFrom(refutedAntigen),
      runId: 'refuted-run', assemblyId: checked.persistedAssemblyId,
      resultId: checked.assembly.results[0].resultId, test: report.claims[0].test,
    }), true);
    const refuted = await repository.load(db, 'tenant-a:project-a:workspace-a');
    const learned = refuted.find((entry) => entry.signature === memory.signatureFrom(refutedAntigen));
    assert.equal(learned.failures, 1);
    assert.equal(learned.affinity, 0);
    assert.equal(memory.recall(refuted, refutedAntigen).signature, learned.signature);
    assert.equal(memory.fuzzyRecall(refuted, refutedAntigen)[0].signature, learned.signature);
    assert.ok(learned.effectiveResponse, 'a confirmed refutation retains the decisive verifier');
    assert.equal(memory.fuzzyRecall(refuted, refutedAntigen, { domain: 'unrelated' }).length, 0);
    assert.equal(await repository.resolve(db, {
      scopeId: 'tenant-a:project-a:workspace-a', signature: learned.signature,
      runId: 'refuted-run', assemblyId: checked.persistedAssemblyId,
      resultId: checked.assembly.results[0].resultId, test: report.claims[0].test,
    }), false, 'repeated evidence must not count twice');
    await verifyFullRetention(db);
    console.log('AEIS immune memory is persisted, scoped and rejects unproven outcomes.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

async function verifyFullRetention(db) {
  await db.run('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) '
    + 'INSERT INTO epistemic_immune_memory_scoped '
    + '(scope_id,signature,pattern_json,domain,affinity,failures,successes,pending,created_at,updated_at) '
    + "SELECT 'full-scope',CAST(x AS TEXT),'{}','general',1,0,1,0,'2000-01-01','2000-01-01' FROM n");
  const entries = await repository.load(db, 'full-scope');
  const antigen = { claim: 'new exposure survives a full memory' };
  memory.recordOutcome(entries, antigen, { outcome: 'pending' });
  await repository.save(db, entries, 'full-scope');
  const rows = await repository.load(db, 'full-scope');
  assert.equal(rows.length, 1000);
  assert.ok(rows.some((row) => row.signature === memory.signatureFrom(antigen)),
    'retention must keep the current exposure until its signed outcome is resolved');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
