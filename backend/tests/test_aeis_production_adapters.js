"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const registry = require('../src/services/verifierTrustRegistry');
const store = require('../src/services/aeisAssemblyStore');
const { validateReceipt } = require('../src/services/epistemicVerifierReceiptService');
async function reload() {
  const db = await getDatabase(process.argv[3]);
  const saved = await store.readAssembly(db, process.argv[4]);
  assert.equal(saved.evaluation.evaluation.eligible, true);
  assert.ok(saved.manifest.implementation.sources.length >= 8);
  await db.run("UPDATE aeis_assurance_assemblies SET payload_json = '{}' WHERE id = ?", process.argv[4]);
  await assert.rejects(store.readAssembly(db, process.argv[4]), /integrity/);
  await closeDatabase();
}
function checkReceipts(result) {
  assert.equal(result.evaluation.eligible, true);
  const receipts = result.assembly.verifications.filter((item) => item.independent);
  assert.ok(receipts.length >= 2);
  const ids = receipts.map((item) => item.executionEvidence[0].executionId);
  assert.equal(new Set(ids).size, receipts.length);
  for (const receipt of receipts) {
    assert.ok(validateReceipt(receipt, registry.listVerifierDigests()));
    assert.ok(receipt.executionEvidence[0].processId > 0);
    const forged = structuredClone(receipt);
    forged.executionEvidence[0].processId = 0;
    assert.equal(validateReceipt(forged, registry.listVerifierDigests()), false);
  }
}
async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-aeis-production-'));
  const database = path.join(root, 'proof.db');
  process.env.GENOS_ADMIN_PASSWORD = 'aeis-proof-admin';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    assert.throws(() => registry.resolveVerifierDigest({ type: 'invented' }), /Unregistered/);
    assert.throws(() => registry.resolveVerifierDigest({ type: 'test', verifierDigest: 'forged' }), /Untrusted/);
    const proof = path.resolve(__dirname, '../src/services/sandboxCommandPolicy.js');
    const independence = path.resolve(__dirname, '../src/services/epistemicScheduler/independencePolicy.js');
    for (const replica of ['a', 'b']) {
      const cwd = path.join(root, replica);
      fs.mkdirSync(cwd);
      fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
        name: `aeis-production-${replica}`, version: '1.0.0', scripts: { test: 'node verify.js' },
      }));
      fs.writeFileSync(path.join(cwd, 'verify.js'), replica === 'a'
        ? `const assert=require('node:assert');assert(require(${JSON.stringify(proof)}).isAllowedSandboxTestCommand('npm test'));`
        : `const assert=require('node:assert');assert.equal(require(${JSON.stringify(independence)}).verificationReplicaTarget({risk:'high'}),2);`);
    }
    const db = await getDatabase(database);
    const result = await require('../src/services/epistemic/aeisPromotionBridge').evaluateReportWithAeis({
      claims: [{ statement: 'npm test exits with code 0',
        evidence: [{ kind: 'reproducible_artifact', content: { command: 'npm test' } }],
        test: { command: 'npm test', replicas: {
          proof: { cwd: path.join(root, 'a') }, source: { cwd: path.join(root, 'b') },
        } } }],
    }, { db, timeoutMs: 180000, allowedWorkspaceRoot: root });
    checkReceipts(result);
    assert.ok(result.persistedAssemblyId);
    await closeDatabase();
    const child = spawnSync(process.execPath, [__filename, 'reload', database, result.persistedAssemblyId],
      { env: process.env, encoding: 'utf8', timeout: 30000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr + child.stdout);
    console.log('Production AEIS adapters: distinct executable replicas, signed process evidence, restart and tamper rejection: PASS');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
(process.argv[2] === 'reload' ? reload() : run()).catch((error) => { console.error(error); process.exitCode = 1; });
