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
    const checked = await bridge.evaluateReportWithAeis(report, { db, immuneMemory: exposure });
    await repository.save(db, exposure, 'tenant-a:project-a:workspace-a');
    const refutedAntigen = bridge.extractAntigensFromReport(report)[0];
    assert.equal(await repository.resolve(db, {
      scopeId: 'tenant-a:project-a:workspace-a', signature: memory.signatureFrom(refutedAntigen),
      runId: 'refuted-run', assemblyId: checked.persistedAssemblyId,
      resultId: checked.assembly.results[0].resultId, test: report.claims[0].test,
    }), true);
    const refuted = await repository.load(db, 'tenant-a:project-a:workspace-a');
    assert.equal(refuted.find((entry) => entry.signature === memory.signatureFrom(refutedAntigen)).failures, 1);
    console.log('AEIS immune memory is persisted, scoped and rejects unproven outcomes.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
