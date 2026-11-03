'use strict';

const crypto = require('node:crypto');
const { digest, fail } = require('./qualityContract');
const integrity = require('./qualityReceiptIntegrity');

async function prepare(db, subject) {
  const value = subject.content;
  if (!value.workerContract.qualityElevation) return {};
  const receipt = value.report.qualityElevationReceipt;
  const worker = { agentId: value.workerId, executionRunId: value.runId,
    workerContract: value.workerContract };
  require('./workerQualityContractEnforcer').enforceQualityContract(worker, value.report, value.report.workerArtifact);
  const saved = await require('./qualityReceiptStore').get(db, {
    runId: value.runId, contractDigest: value.workerContract.qualityElevation.digest });
  if (!saved || digest(saved.receipt) !== digest(receipt)) {
    throw fail('GQEL_RECEIPT_MISSING', 'An isolated verifier requires the persisted native quality receipt.');
  }
  const pair = crypto.generateKeyPairSync('ed25519');
  const body = { schema: 'genos.native-quality-verification/v1', receiptDigest: digest(receipt),
    workerId: value.workerId, runId: value.runId, expiresAt: receipt.expiresAt };
  return { proof: { ...body, signature: crypto.sign(null, Buffer.from(integrity.encode(body)), pair.privateKey).toString('base64') },
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
}

function authenticated(receipt, context) {
  const proof = context.worker.nativeQualityVerification;
  const pinned = process.env.GENOS_ORACLE_QUALITY_PUBLIC_KEY;
  if (!pinned || proof?.schema !== 'genos.native-quality-verification/v1') return false;
  const { signature, ...body } = proof;
  if (body.receiptDigest !== digest(receipt) || body.workerId !== context.worker.agentId
    || body.runId !== integrity.runIdOf(context.worker) || Date.now() >= Date.parse(body.expiresAt)) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(pinned, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(integrity.encode(body)), key, Buffer.from(signature, 'base64'));
  } catch (_) { return false; }
}

module.exports = { prepare, authenticated };
