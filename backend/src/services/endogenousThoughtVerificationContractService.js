'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const CONTRACT_TYPE = 'EndogenousThoughtVerification';
const CONTRACT_VERSION = 'v1';
const VERDICTS = new Set(['supported', 'refuted', 'inconclusive']);
const NONCE = /^[A-Za-z0-9._:-]{16,128}$/;
const FIELDS = new Set(['verificationId', 'episodeId', 'projectId', 'runId', 'runRef',
  'taskId', 'proposalRef', 'policyId', 'authorizationRef', 'verdict', 'oracleRef',
  'verifier', 'attestation', 'evidenceRefs', 'boundaries', 'verifiedAt']);
const BOUNDARIES = Object.freeze({ independentVerifier: true, learningApplied: false,
  continuationAuthorized: false, externalActionAllowed: false, promotionEligible: false });

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function publicKeyDigest(pem) {
  if (typeof pem !== 'string' || pem.length > 4096) throw new TypeError('Ed25519 public key required.');
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('Verifier key must use Ed25519.');
  const der = key.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex');
}

function verificationIdFor(value) {
  const basis = { projectId: value.projectId, episodeId: value.episodeId,
    runId: value.runId, verifierId: value.verifierId || value.verifier?.id,
    policyId: value.policyId };
  return `ett_verification_${digest(basis).slice(0, 24)}`;
}

function attestationMaterial(payload) {
  return { schema: 'genos.endogenous-thought-verification-attestation/v1',
    verificationId: payload.verificationId, episodeId: payload.episodeId,
    projectId: payload.projectId, runId: payload.runId, runRef: payload.runRef,
    taskId: payload.taskId, proposalRef: payload.proposalRef, policyId: payload.policyId,
    authorizationRef: payload.authorizationRef, verdict: payload.verdict,
    oracleRef: payload.oracleRef, verifierId: payload.verifier?.id,
    verifierKeyDigest: payload.verifier?.keyDigest, evidenceRefs: payload.evidenceRefs,
    boundaries: payload.boundaries, verifiedAt: payload.verifiedAt,
    nonce: payload.attestation?.nonce };
}

function validVerifier(value) {
  if (!exactFields(value, ['id', 'keyDigest', 'publicKey']) || !nonEmpty(value.id)) return false;
  try { return value.keyDigest === publicKeyDigest(value.publicKey); } catch (_) { return false; }
}

function validAttestation(payload) {
  const value = payload.attestation;
  if (!exactFields(value, ['nonce', 'signature']) || !NONCE.test(value.nonce || '')
    || typeof value.signature !== 'string') return false;
  try {
    return crypto.verify(null, Buffer.from(canonicalJson(attestationMaterial(payload))),
      crypto.createPublicKey(payload.verifier.publicKey), Buffer.from(value.signature, 'base64'));
  } catch (_) { return false; }
}

function validBoundaries(value) {
  const fields = Object.keys(BOUNDARIES);
  return exactFields(value, fields) && fields.every((field) => value[field] === BOUNDARIES[field]);
}

function validEvidence(payload) {
  const refs = payload.evidenceRefs;
  return stringList(refs) && refs.length >= 2 && new Set(refs).size === refs.length
    && refs.includes(payload.runRef) && refs.includes(payload.oracleRef);
}

function validateIdentity(payload, errors) {
  const identities = ['verificationId', 'episodeId', 'projectId', 'runId', 'runRef',
    'taskId', 'proposalRef', 'policyId', 'authorizationRef', 'oracleRef'];
  if (identities.some((field) => !nonEmpty(payload[field]))) errors.push('identity');
  const keys = Object.keys(payload);
  if (keys.length !== FIELDS.size || keys.some((field) => !FIELDS.has(field))) errors.push('fields');
  if (payload.verificationId !== verificationIdFor(payload)) errors.push('identity');
}

function validatePayload(payload) {
  if (!isRecord(payload)) return { valid: false, errors: ['payload'] };
  const errors = [];
  validateIdentity(payload, errors);
  if (!VERDICTS.has(payload.verdict)) errors.push('verdict');
  if (!validVerifier(payload.verifier)) errors.push('verifier');
  if (!validBoundaries(payload.boundaries)) errors.push('boundaries');
  if (!validEvidence(payload)) errors.push('evidence');
  if (!nonEmpty(payload.verifiedAt) || Number.isNaN(Date.parse(payload.verifiedAt))) errors.push('timestamp');
  if (!validAttestation(payload)) errors.push('attestation');
  return { valid: errors.length === 0, errors };
}

function receiptId(payload) {
  return `rcpt_${digest(`${CONTRACT_TYPE}:${canonicalJson(payload)}`).slice(0, 24)}`;
}

function createReceipt(payload) {
  const validation = validatePayload(payload);
  if (!validation.valid) {
    throw Object.assign(new Error('Invalid EndogenousThoughtVerification contract'), {
      code: 'INVALID_ENDOGENOUS_VERIFICATION_CONTRACT', errors: validation.errors });
  }
  return Object.freeze({ schema: `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`,
    contractType: CONTRACT_TYPE, contractVersion: CONTRACT_VERSION,
    receiptId: receiptId(payload), sourceRefs: [...payload.evidenceRefs],
    issuedAt: payload.verifiedAt, payload: structuredClone(payload) });
}

function validEnvelope(receipt) {
  if (!isRecord(receipt)) return false;
  return receipt.schema === `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`
    && receipt.contractType === CONTRACT_TYPE && receipt.contractVersion === CONTRACT_VERSION
    && nonEmpty(receipt.receiptId) && isRecord(receipt.payload);
}

function readReceipt(receipt) {
  if (!validEnvelope(receipt)) return { valid: false, errors: ['envelope'] };
  const validation = validatePayload(receipt.payload);
  const sourcesMatch = JSON.stringify(receipt.sourceRefs) === JSON.stringify(receipt.payload.evidenceRefs);
  const sealed = receipt.receiptId === receiptId(receipt.payload)
    && receipt.issuedAt === receipt.payload.verifiedAt && sourcesMatch;
  if (!sealed) validation.errors.push('envelope-integrity');
  return { valid: validation.errors.length === 0, errors: validation.errors };
}

module.exports = { BOUNDARIES, CONTRACT_TYPE, CONTRACT_VERSION, attestationMaterial,
  createReceipt, publicKeyDigest, readReceipt, validatePayload, verificationIdFor };
