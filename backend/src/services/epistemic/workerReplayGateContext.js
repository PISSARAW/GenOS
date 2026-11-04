'use strict';
const journal = require('./nativeOracleJournal');
const {digest} = require('../biologicalIntegrity');

async function context(db, proof) {
  const attested = proof.attestation.value;
  const saved = await journal.read(db, {runId: attested.runId, scope: attested.scope, kind: 'code-replay'});
  if (!saved) return {};
  const receipt = saved.value;
  assertBinding(receipt, attested);
  if (!receipt.tests?.length || receipt.tests.some(test => test.exitCode !== 0 || test.timedOut)) {
    throw Error('WORKER_REPLAY_TESTS_MISSING');
  }
  return {agentId: attested.agentId, runId: attested.runId, replayReceipt: receipt,
    replayEvidenceHash: digest(receipt)};
}
function assertBinding(receipt, attested) {
  if (receipt.schema !== 'genos.worker-code-replay/v1') throw Error('WORKER_REPLAY_SCHEMA_INVALID');
  if (['runId', 'agentId', 'authorityHash', 'reportHash'].some(key => receipt[key] !== attested[key])) {
    throw Error('WORKER_REPLAY_RECEIPT_BINDING_MISMATCH');
  }
  if (!receipt.chainProof?.execution_replayed || receipt.chainProof.replay_status !== 'VERIFIED') {
    throw Error('WORKER_REPLAY_CHAIN_UNVERIFIED');
  }
}
module.exports = {context};
