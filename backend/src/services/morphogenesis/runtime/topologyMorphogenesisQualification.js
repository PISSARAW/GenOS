'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../../stateFingerprint');
const {
  assessTopologyMorphogenesis, executeQualifiedTopologyMorphogenesis
} = require('./topologyMorphogenesisAdmission');
const { REQUIRED_CAPABILITIES } = require('./topologyMorphogenesisTransaction');

const LEASE_SCHEMA = 'genos.topology-morphogenesis-qualification/v1';
const REVOCATION_SCHEMA = 'genos.topology-morphogenesis-qualification-revocation/v1';
const LEDGER_SCHEMA = 'genos.topology-morphogenesis-qualification-revocations/v1';
const TRUST_SCHEMA = 'genos.topology-morphogenesis-qualification-authorities/v1';
const ASSESSMENT_SCHEMA = 'genos.topology-morphogenesis-qualification-assessment/v1';
const GENESIS_HASH = '0'.repeat(64);
const MAX_TTL_MS = 15 * 60 * 1000;

function issueQualificationLease(input = {}) {
  const admission = assessTopologyMorphogenesis(input);
  if (!admission.admitted) throw admissionFailure(admission);
  assertPortQualified(input.port);
  const timing = leaseTiming(input);
  const body = canonicalValue({
    schema: LEASE_SCHEMA, status: 'current', topology: admission.topology,
    variantId: admission.variantId, canonicalVariantId: admission.canonicalVariantId,
    qualificationDigest: admission.qualificationDigest,
    portDigest: portDigest(input.port), evidenceRefs: admission.evidenceRefs,
    authorityId: authorityId(input.issuer), issuedAt: timing.issuedAt,
    expiresAt: timing.expiresAt, authorizesPromotion: false
  });
  const signature = sign(body, input.issuer.privateKey, 'TOPOLOGY_QUALIFICATION_SIGNING_FAILED');
  return { ...body, signature, leaseHash: fingerprint({ ...body, signature }) };
}

function issueQualificationRevocation(input = {}) {
  const body = revocationBody(input);
  const signature = sign(body, input.privateKey, 'TOPOLOGY_QUALIFICATION_REVOCATION_SIGNING_FAILED');
  return { ...body, signature, entryHash: fingerprint({ ...body, signature }) };
}

function assertQualificationCurrent(input = {}) {
  const lease = input.qualificationLease;
  const admission = input.admission || assessTopologyMorphogenesis(input);
  assertPortQualified(input.port);
  assertLeaseIntegrity(lease, input.qualificationTrustRegistry);
  assertLeaseTiming(lease, input.now);
  assertLeaseBinding(lease, admission, input.port);
  const revocations = inspectRevocations({ ledger: input.qualificationRevocationLedger,
    trustRegistry: input.qualificationTrustRegistry, now: input.now });
  if (!revocations.valid) throw coded('TOPOLOGY_QUALIFICATION_REVOCATION_INVALID', revocations.reason);
  if (revocations.activeLeaseHashes.includes(lease.leaseHash)) {
    throw coded('TOPOLOGY_QUALIFICATION_REVOKED', 'Topology qualification lease is revoked.');
  }
  return {
    schema: ASSESSMENT_SCHEMA, status: 'current', leaseHash: lease.leaseHash,
    qualificationDigest: admission.qualificationDigest, assessedAt: iso(input.now),
    validUntil: lease.expiresAt, revocationHeadHash: revocations.headHash,
    authorizesPromotion: false
  };
}

async function executeAttestedTopologyMorphogenesis(input = {}) {
  const admission = assessTopologyMorphogenesis(input);
  if (!admission.admitted) throw admissionFailure(admission);
  const qualification = assertQualificationCurrent({ ...input, admission });
  const transaction = await executeQualifiedTopologyMorphogenesis(input);
  return { ...transaction, qualification, promotionEligible: false };
}

function leaseTiming(input) {
  const issuedAtMs = instant(input.now, 'TOPOLOGY_QUALIFICATION_TIME_INVALID');
  if (!Number.isInteger(input.ttlMs) || input.ttlMs < 1 || input.ttlMs > MAX_TTL_MS) {
    throw coded('TOPOLOGY_QUALIFICATION_TTL_INVALID', 'Qualification TTL is outside the allowed window.');
  }
  return { issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + input.ttlMs).toISOString() };
}

function authorityId(issuer) {
  if (typeof issuer?.id !== 'string' || !issuer.id.trim()) {
    throw coded('TOPOLOGY_QUALIFICATION_AUTHORITY_REQUIRED', 'Qualification authority is required.');
  }
  return issuer.id.trim();
}

function portDigest(port) {
  if (!port || typeof port.describe !== 'function') {
    throw coded('TOPOLOGY_QUALIFICATION_PORT_REQUIRED', 'A describable topology port is required.');
  }
  return fingerprint(port.describe());
}

function assertPortQualified(port) {
  const missing = REQUIRED_CAPABILITIES.filter((capability) =>
    typeof port?.qualified !== 'function' || !port.qualified(capability));
  if (missing.length) {
    throw coded('TOPOLOGY_QUALIFICATION_PORT_UNQUALIFIED',
      `Topology port lifecycle is not qualified: ${missing.join(', ')}.`);
  }
}

function assertLeaseIntegrity(lease, trustRegistry) {
  if (!lease || lease.schema !== LEASE_SCHEMA || lease.status !== 'current'
    || lease.authorizesPromotion !== false) throw coded('TOPOLOGY_QUALIFICATION_LEASE_INVALID', 'Invalid qualification lease.');
  const { leaseHash, signature, ...body } = lease;
  const publicKey = trustedKey(trustRegistry, body.authorityId);
  const intact = fingerprint({ ...body, signature }) === leaseHash;
  if (!intact || !verify(body, signature, publicKey)) {
    throw coded('TOPOLOGY_QUALIFICATION_LEASE_INVALID', 'Qualification lease integrity failed.');
  }
}

function assertLeaseTiming(lease, now) {
  const nowMs = instant(now, 'TOPOLOGY_QUALIFICATION_TIME_INVALID');
  const issuedAt = instant(lease.issuedAt, 'TOPOLOGY_QUALIFICATION_LEASE_INVALID');
  const expiresAt = instant(lease.expiresAt, 'TOPOLOGY_QUALIFICATION_LEASE_INVALID');
  if (nowMs < issuedAt || nowMs >= expiresAt || expiresAt - issuedAt > MAX_TTL_MS) {
    throw coded('TOPOLOGY_QUALIFICATION_EXPIRED', 'Qualification lease is not current.');
  }
}

function assertLeaseBinding(lease, admission, port) {
  const matches = admission.admitted && lease.topology === admission.topology
    && lease.variantId === admission.variantId
    && lease.canonicalVariantId === admission.canonicalVariantId
    && lease.qualificationDigest === admission.qualificationDigest
    && lease.portDigest === portDigest(port)
    && fingerprint(lease.evidenceRefs) === fingerprint(admission.evidenceRefs);
  if (!matches) throw coded('TOPOLOGY_QUALIFICATION_BINDING_MISMATCH', 'Qualification lease no longer matches runtime admission.');
}

function revocationBody(input) {
  const body = canonicalValue({
    schema: REVOCATION_SCHEMA, sequence: input.sequence, leaseHash: input.leaseHash,
    authorityId: input.authorityId, reason: input.reason, revokedAt: iso(input.revokedAt),
    previousHash: input.previousHash || GENESIS_HASH
  });
  if (!Number.isInteger(body.sequence) || body.sequence < 1
    || !hash(body.leaseHash) || !hash(body.previousHash)) {
    throw coded('TOPOLOGY_QUALIFICATION_REVOCATION_INVALID', 'Invalid revocation identity.');
  }
  if (!text(body.authorityId) || !text(body.reason)) {
    throw coded('TOPOLOGY_QUALIFICATION_REVOCATION_INVALID', 'Invalid revocation authority or reason.');
  }
  return body;
}

function inspectRevocations(input) {
  try {
    if (!input.ledger || input.ledger.schema !== LEDGER_SCHEMA
      || !Array.isArray(input.ledger.revocations)) throw coded('LEDGER_INVALID', 'Invalid revocation ledger.');
    const nowMs = instant(input.now, 'TOPOLOGY_QUALIFICATION_TIME_INVALID');
    const activeLeaseHashes = [];
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < input.ledger.revocations.length; index += 1) {
      const entry = input.ledger.revocations[index];
      const body = verifyRevocation({ entry, trustRegistry: input.trustRegistry,
        expectedSequence: index + 1, previousHash });
      if (Date.parse(body.revokedAt) <= nowMs) activeLeaseHashes.push(body.leaseHash);
      previousHash = entry.entryHash;
    }
    return { valid: true, reason: null,
      activeLeaseHashes: [...new Set(activeLeaseHashes)].sort(), headHash: previousHash };
  } catch (error) {
    return { valid: false, reason: error.code || 'TOPOLOGY_QUALIFICATION_REVOCATION_INVALID',
      activeLeaseHashes: [], headHash: null };
  }
}

function verifyRevocation(input) {
  const body = revocationBody(input.entry);
  const publicKey = trustedKey(input.trustRegistry, body.authorityId);
  const validChain = body.sequence === input.expectedSequence && body.previousHash === input.previousHash;
  const intact = input.entry.entryHash === fingerprint({ ...body, signature: input.entry.signature });
  if (!validChain || !intact || !verify(body, input.entry.signature, publicKey)) {
    throw coded('TOPOLOGY_QUALIFICATION_REVOCATION_INVALID', 'Revocation chain or signature is invalid.');
  }
  return body;
}

function trustedKey(registry, authority) {
  const authorities = trustAuthorities(registry);
  const matches = authorities.filter((item) => item.id === authority && item.status === 'active');
  if (matches.length !== 1) throw coded('TOPOLOGY_QUALIFICATION_TRUST_INVALID', 'Qualification authority is not uniquely trusted.');
  return matches[0].publicKey;
}

function trustAuthorities(registry) {
  if (!registry || registry.schema !== TRUST_SCHEMA || !Array.isArray(registry.authorities)) {
    throw coded('TOPOLOGY_QUALIFICATION_TRUST_INVALID', 'Qualification trust registry is invalid.');
  }
  const identifiers = new Set();
  for (const entry of registry.authorities) {
    if (!validTrustEntry(entry) || identifiers.has(entry.id)) {
      throw coded('TOPOLOGY_QUALIFICATION_TRUST_INVALID', 'Qualification trust entries are invalid.');
    }
    identifiers.add(entry.id);
  }
  return registry.authorities;
}

function validTrustEntry(entry) {
  return text(entry?.id) && text(entry.publicKey) && ['active', 'retired'].includes(entry.status);
}

function sign(body, privateKey, code) {
  try { return crypto.sign(null, payload(body), privateKey).toString('base64'); }
  catch (_) { throw coded(code, 'Unable to sign topology qualification data.'); }
}

function verify(body, signature, publicKey) {
  try { return crypto.verify(null, payload(body), publicKey, Buffer.from(signature || '', 'base64')); }
  catch (_) { return false; }
}

function payload(body) { return Buffer.from(JSON.stringify(canonicalValue(body))); }
function hash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }

function instant(value, code) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw coded(code, 'Invalid qualification time.');
  return parsed;
}

function iso(value) { return new Date(instant(value, 'TOPOLOGY_QUALIFICATION_TIME_INVALID')).toISOString(); }

function admissionFailure(admission) {
  const error = coded(admission.code, `Topology variant admission refused: ${admission.failures.join(', ')}.`);
  error.admission = admission;
  return error;
}

function coded(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = {
  ASSESSMENT_SCHEMA, GENESIS_HASH, LEASE_SCHEMA, LEDGER_SCHEMA, MAX_TTL_MS,
  REVOCATION_SCHEMA, TRUST_SCHEMA, assertQualificationCurrent,
  executeAttestedTopologyMorphogenesis, inspectRevocations,
  issueQualificationLease, issueQualificationRevocation
};
