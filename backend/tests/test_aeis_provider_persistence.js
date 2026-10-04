'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const { runProviderMetapopulation } = require('../src/services/epistemic/epistemicProviderMetapopulation');

async function main() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'test-admin-password-aeis-provider';
  const dbPath = path.join(os.tmpdir(), `aeis-provider-${process.pid}.db`);
  const db = await getDatabase(dbPath);
  try {
    const antigen = { id: 'claim-persisted', claim: 'echo ok exits with code 0',
      epitopes: { evidence: { digest: 'sha256:provider-test' } } };
    const profiles = [{ provider: 'openai', model: 'openai://a' },
      { provider: 'anthropic', model: 'anthropic://b' }];
    const review = await runProviderMetapopulation(antigen, profiles, {
      db, scopeId: 'tenant:project:workspace', runId: 'run-provider-test',
      runner: async (inputs) => inputs.map((item) => ({ provider: item.provider, model: item.model,
        text: JSON.stringify({ claimId: antigen.id, evidenceDigest: antigen.epitopes.evidence.digest,
          verdict: 'supports', rationale: 'independent assessment' }) })),
    });
    assert.equal(review.status, 'complete');
    const rows = await db.all('SELECT provider, status, verdict, response_digest FROM aeis_provider_reviews WHERE scope_id = ? AND run_id = ?',
      'tenant:project:workspace', 'run-provider-test');
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((row) => row.provider)).size, 2);
    assert.ok(rows.every((row) => row.status === 'completed' && row.verdict === 'supports' && row.response_digest));
    assert.equal((await db.all('SELECT * FROM aeis_provider_reviews WHERE scope_id = ?', 'other:project:workspace')).length, 0);
    console.log('AEIS provider reviews persist under the run and tenant scope.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
