'use strict';

const { digest } = require('../../evidenceContractService');
const signer = require('../../agentGitService/helpers');
const trust = require('../../verifierTrustRegistry');

const SCHEMA = 'genos.metapopulation-cycle-verification/v1';
const AUTHORITY_ID = 'metapopulation-regional-effect-verifier';
const AUTHORITY_TYPE = 'native_oracle_quality';

function identity(value) {
  return typeof value === 'string' && value.trim()
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : null;
}

function verificationMaterial(verification = {}) {
  const { receipt, ...material } = verification;
  return material;
}

function selfDeclaredAuthority(verification = {}) {
  return ['verifierId', 'independent', 'authorityReceipt']
    .some((field) => Object.hasOwn(verification, field));
}

function receiptBody(input = {}) {
  return { schema: SCHEMA, missionId: input.missionId,
    metapopulationId: input.metapopulationId, cycle: input.cycle,
    verdict: 'VERIFIED', producerId: input.producerId,
    verifierId: AUTHORITY_ID, independent: input.producerId !== AUTHORITY_ID,
    canonicalRevision: input.stateSeal?.revision,
    canonicalStateHash: input.stateSeal?.hash,
    resultHash: digest(input.execution),
    verificationHash: digest(verificationMaterial(input.verification)) };
}

function evidenceDigest(input, body) {
  return digest({ receipt: body, execution: input.execution,
    verification: verificationMaterial(input.verification) });
}

function issueAuthorityReceipt(input, body) {
  const verifierDigest = trust.ensureVerifier(AUTHORITY_TYPE, '1.0').digest;
  const stateHash = digest(body);
  const metadata = { schema: 'genos.metapopulation-authority/v1',
    evidenceDigest: evidenceDigest(input, body), verifierDigest,
    authorityId: AUTHORITY_ID, authorityType: AUTHORITY_TYPE };
  return { ...metadata, stateHash,
    signatureAlgorithm: signer.signingAlgorithm(),
    signature: signer.signObject(stateHash, metadata) };
}

function validSeal(seal = {}) {
  return Number.isSafeInteger(Number(seal.revision)) && Number(seal.revision) >= 1
    && /^sha256:[a-f0-9]{64}$/.test(seal.hash || '');
}

function issue(input = {}) {
  const producerId = identity(input.producerId);
  const cycle = Number(input.cycle);
  if (!identity(input.missionId) || !identity(input.metapopulationId)
      || !Number.isSafeInteger(cycle) || cycle < 1 || !validSeal(input.stateSeal)) return null;
  if (!producerId || producerId === AUTHORITY_ID
      || selfDeclaredAuthority(input.verification)) return null;
  const body = receiptBody({ ...input, producerId });
  const authorityReceipt = issueAuthorityReceipt(input, body);
  return { ...body, authorityReceipt,
    receiptHash: digest({ ...body, authorityReceipt }) };
}

function validScope(input) {
  const receipt = input.receipt;
  return receipt.schema === SCHEMA && receipt.missionId === input.missionId
    && receipt.metapopulationId === input.metapopulationId
    && Number(receipt.cycle) === Number(input.cycle);
}

function validIdentities(receipt) {
  const producerId = identity(receipt.producerId);
  const verifierId = identity(receipt.verifierId);
  return Boolean(producerId && producerId === receipt.producerId
    && verifierId === AUTHORITY_ID && receipt.independent === true
    && producerId !== verifierId);
}

function validAuthority(input, body) {
  const signed = input.receipt.authorityReceipt;
  const verifierDigest = trust.ensureVerifier(AUTHORITY_TYPE, '1.0').digest;
  const metadata = { schema: 'genos.metapopulation-authority/v1',
    evidenceDigest: evidenceDigest(input, body), verifierDigest,
    authorityId: AUTHORITY_ID, authorityType: AUTHORITY_TYPE };
  return signed?.stateHash === digest(body)
    && signed?.evidenceDigest === metadata.evidenceDigest
    && signed?.verifierDigest === verifierDigest
    && signed?.authorityId === AUTHORITY_ID
    && signed?.authorityType === AUTHORITY_TYPE
    && signed?.signatureAlgorithm === signer.signingAlgorithm()
    && signer.verifyObjectSignature({ state_hash: signed.stateHash,
      metadata_json: JSON.stringify(metadata), signature: signed.signature });
}

function validBinding(input) {
  const seal = { revision: input.receipt.canonicalRevision,
    hash: input.receipt.canonicalStateHash };
  if (!validSeal(seal)) return false;
  const body = receiptBody({ ...input, stateSeal: seal,
    producerId: input.receipt.producerId });
  return input.receipt.verdict === 'VERIFIED'
    && input.receipt.resultHash === body.resultHash
    && input.receipt.verificationHash === body.verificationHash
    && validAuthority(input, body)
    && input.receipt.receiptHash === digest({ ...body,
      authorityReceipt: input.receipt.authorityReceipt });
}

function validate(input = {}) {
  const receipt = input.receipt;
  if (!receipt) return { valid: false, missing: true };
  return { valid: validScope(input) && validIdentities(receipt)
    && validBinding(input), missing: false };
}

module.exports = { SCHEMA, AUTHORITY_ID, issue, validate,
  verificationMaterial, identity };
