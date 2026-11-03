'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'isolated-oracle-quality-fixture-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/qualityReceiptFixture.cjs');
const bridge = require('../src/services/qualityElevation/qualityNativeVerification');
const native = require('../src/services/epistemic/oracleNativeProcess');

async function main() {
  const ctx = await fixture.create();
  try {
    const report = { outcome: 'success', claims: [{ statement: 'Synthetic tested candidate.', evidence: ['mission'] }],
      workerArtifact: { type: 'creative_candidate', content: { candidate: ctx.text,
        assumptions: ['Synthetic test only.'], falsificationTest: 'Compare actual text to the fixed rubric.' },
      provenance: { sourceRefs: ['mission'] } } };
    report.qualityElevationReceipt = await require('../src/services/qualityElevation/qualityReceiptService')
      .issueQualityReceipt({ ...ctx, artifact: report.workerArtifact, report });
    const methodContract = { version: 1, methodId: 'prompt_defined' };
    const workerContract = structuredClone(ctx.worker.workerContract);
    workerContract.mission.methodContract = methodContract;
    const subject = { content: { workerId: 'worker', runId: ctx.executionRunId, workerKind: 'creative_worker',
      workerContract, methodContract, report } };
    const proof = await bridge.prepare(ctx.db, subject);
    const options = { kind: 'worker-artifact', strategy: 'typed_artifact_contract',
      qualityPublicKey: proof.publicKey, timeoutMs: 10000 };
    const verified = await native.run({ ...subject, qualityVerification: proof.proof }, options);
    assert.equal(verified.result.status, 'verified', JSON.stringify(verified.result));
    assert.equal(verified.detail.qualityVerificationKey, proof.publicKey);
    const absent = await native.run(subject, { ...options, qualityPublicKey: undefined });
    assert.equal(absent.result.status, 'refuted', 'sandbox must not inherit the HMAC signing secret');
    const forged = await native.run({ ...subject, qualityVerification: { ...proof.proof, runId: 'other' } }, options);
    assert.equal(forged.result.status, 'refuted');
    const changed = structuredClone(subject);
    changed.content.report.workerArtifact.content.candidate += '\nUnreviewed change.';
    const stale = await native.run({ ...changed, qualityVerification: proof.proof }, options);
    assert.equal(stale.result.status, 'refuted');
    const wrongKey = require('node:crypto').generateKeyPairSync('ed25519').publicKey
      .export({ format: 'der', type: 'spki' }).toString('base64');
    const unpinned = await native.run({ ...subject, qualityVerification: proof.proof }, { ...options, qualityPublicKey: wrongKey });
    assert.equal(unpinned.result.status, 'refuted');
    const noReceipt = structuredClone(subject);
    delete noReceipt.content.report.qualityElevationReceipt;
    await assert.rejects(bridge.prepare(ctx.db, noReceipt));
    console.log('Isolated native oracle verifies persisted GQEL evidence with a pinned public key and rejects missing, forged, stale and unpinned proof without inheriting secrets: PASS');
  } finally { await ctx.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
