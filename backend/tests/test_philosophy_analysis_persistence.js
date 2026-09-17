'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const router = require('../src/services/philosophyRouter');

const dbPath = path.join(__dirname, `.tmp-philosophy-analyses-${process.pid}.db`);

async function main() {
  process.env.GENOS_ADMIN_PASSWORD = 'test-only-philosophy-analysis';
  process.env.GENOS_DB_PATH = dbPath;
  await getDatabase(dbPath);

  const saved = await router.handlePhilosophyRequest({
    request: {
      operation: 'saveAnalysis',
      arguments: {
        conceptId: 'aesthetics.beauty',
        analysisId: 'analysis-test-1',
        input: { subject: { unity: 0.9 } },
        result: { status: 'underdetermined', confidence: 0.2 },
        provenance: { source: 'test', evidence: ['provided_feature'] },
        createdBy: 'test-suite'
      }
    }
  });
  assert.equal(saved.saved, true);
  assert.equal(saved.analysis.id, 'analysis-test-1');
  assert.equal(saved.analysis.conceptId, 'aesthetics.beauty');
  assert.equal(saved.analysis.provenance.source, 'test');

  const fetched = await router.handlePhilosophyRequest({
    request: { operation: 'getAnalysis', arguments: { analysisId: 'analysis-test-1' } }
  });
  assert.equal(fetched.analysis.result.confidence, 0.2);

  const listed = await router.handlePhilosophyRequest({
    request: { operation: 'listAnalyses', arguments: { conceptId: 'aesthetics.beauty' } }
  });
  assert.equal(listed.analyses.length, 1);

  const missing = await router.handlePhilosophyRequest({
    request: { operation: 'getAnalysis', arguments: { analysisId: 'missing-analysis' } }
  });
  assert.equal(missing.analysis, null);

  await closeDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
  console.log('Philosophical analysis persistence: save, fetch and list passed');
}

main().catch(async (error) => {
  await closeDatabase().catch(() => {});
  console.error(error.stack || error.message);
  process.exit(1);
});
