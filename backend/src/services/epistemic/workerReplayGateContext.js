'use strict';
const journal = require('./nativeOracleJournal');
const {digest} = require('../biologicalIntegrity');

async function context(db, proof) {
  const attested = proof.attestation.value;
  const saved = await journal.read(db, {runId: attested.runId, scope: attested.scope, kind: 'evidence-replay'})
    || await journal.read(db, {runId: attested.runId, scope: attested.scope, kind: 'code-replay'});
  if (!saved) return {};
  const receipt = saved.value;
  assertBinding(receipt, attested);
  assertVerification(receipt);
  return {agentId: attested.agentId, runId: attested.runId, replayReceipt: receipt,
    replayEvidenceHash: digest(receipt)};
}

function assertVerification(receipt) {
  if (receipt.schema === 'genos.worker-evidence-replay/v1') return assertQualityEvidence(receipt);
  if (!receipt.tests?.length || receipt.tests.some(test => test.exitCode !== 0 || test.timedOut)) {
    throw Error('WORKER_REPLAY_TESTS_MISSING');
  }
}

function assertQualityEvidence(receipt) {
  const evidence = receipt.verification;
  const validDigest = value => /^[a-f0-9]{64}$/.test(value || '');
  if (receipt.tests?.length || evidence?.kind !== 'native_gqel_quality_review'
      || !evidence.receiptId || !validDigest(evidence.receiptDigest) || !validDigest(evidence.artifactDigest)) {
    throw Error('WORKER_REPLAY_QUALITY_EVIDENCE_INVALID');
  }
}

function assertBinding(receipt, attested) {
  if (!['genos.worker-code-replay/v1', 'genos.worker-evidence-replay/v1'].includes(receipt.schema)) {
    throw Error('WORKER_REPLAY_SCHEMA_INVALID');
  }
  if (['runId', 'agentId', 'authorityHash', 'reportHash'].some(key => receipt[key] !== attested[key])) {
    throw Error('WORKER_REPLAY_RECEIPT_BINDING_MISMATCH');
  }
  if (!receipt.chainProof?.execution_replayed || receipt.chainProof.replay_status !== 'VERIFIED') {
    throw Error('WORKER_REPLAY_CHAIN_UNVERIFIED');
  }
}
module.exports = {context, assertBinding, assertVerification};
