'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { getDatabase, closeDatabase } = require('../src/db');
const registry = require('../src/services/verifierTrustRegistry');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const store = require('../src/services/aeisAssemblyStore');

async function main() {
  const old = {
    id: process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID,
    secret: process.env.GENOS_EPISTEMIC_RECEIPT_SECRET,
    previous: process.env.GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS,
  };
  process.env.GENOS_ADMIN_PASSWORD ||= 'test-admin-password-aeis-assembly';
  process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID = 'key-a';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'assembly-secret-a';
  delete process.env.GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS;
  const dbPath = path.join(os.tmpdir(), `aeis-assembly-${process.pid}.db`);
  try {
    const db = await getDatabase(dbPath);
    const receipt = issueReceipt({ resultId: 'result-a', evidenceDigest: 'sha256:' + 'a'.repeat(64),
      verifierDigest: registry.resolveVerifierDigest({ type: 'test' }), status: 'verified' });
    const id = await store.saveAssembly(db, {
      evaluation: { eligible: true }, assembly: { verifications: [receipt] },
    });
    assert.equal((await store.readAssembly(db, id)).evaluation.evaluation.eligible, true);
    await db.run('UPDATE aeis_assurance_assemblies SET run_id = ? WHERE id = ?', 'forged-run', id);
    await assert.rejects(store.readAssembly(db, id), /integrity failure/);
    await db.run('UPDATE aeis_assurance_assemblies SET run_id = NULL WHERE id = ?', id);
    const legacyId = 'legacy-assembly';
    const legacyPayload = JSON.stringify({ evaluation: { eligible: true }, assembly: { verifications: [] } });
    const legacyManifest = JSON.stringify({ trustedDigests: [] });
    const { digest } = require('../src/services/verifierImplementationManifest');
    const legacySeal = crypto.createHmac('sha256', 'legacy-secret')
      .update([legacyId, digest(legacyPayload), digest(legacyManifest)].join('\0')).digest('hex');
    await db.run(`INSERT INTO aeis_assurance_assemblies
      (id, payload_json, manifest_json, signature, key_id, signature_version, created_at)
      VALUES (?, ?, ?, ?, 'legacy', 1, CURRENT_TIMESTAMP)`,
    legacyId, legacyPayload, legacyManifest, legacySeal);
    process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID = 'key-b';
    process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'assembly-secret-b';
    process.env.GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS = JSON.stringify({ 'key-a': 'assembly-secret-a', legacy: 'legacy-secret' });
    assert.equal((await store.readAssembly(db, id)).evaluation.evaluation.eligible, true);
    assert.equal((await store.readAssembly(db, legacyId)).evaluation.evaluation.eligible, true);
    delete process.env.GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS;
    await assert.rejects(store.readAssembly(db, id), /key unavailable/);
    process.env.GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS = JSON.stringify({ 'key-a': 'assembly-secret-a', legacy: 'legacy-secret' });
    await db.run("UPDATE aeis_assurance_assemblies SET created_at = datetime('now', '-200 days') WHERE id = ?", id);
    await store.pruneAssemblies(db, 90);
    await assert.rejects(store.readAssembly(db, id), /not found/);
    console.log('AEIS assemblies survive key rotation and obey retention.');
  } finally {
    await closeDatabase();
    for (const [key, value] of Object.entries({ GENOS_EPISTEMIC_RECEIPT_KEY_ID: old.id,
      GENOS_EPISTEMIC_RECEIPT_SECRET: old.secret,
      GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS: old.previous })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
