'use strict';

const assert = require('node:assert/strict');
const vectors = require('../../shared/evidenceProtocol.v1.vectors.json');
const { canonicalize, digest } = require('../src/services/evidenceProtocol/canonical');
const { PROTOCOL, MESSAGE_TYPES, validateMessage, validateClaim } = require('../src/services/evidenceProtocol/contract');
const { NOW, claim, message } = require('./helpers/evidenceProtocolContractFixture');

for (const vector of vectors) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
}

assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
assert.notEqual(digest([1, 2]), digest([2, 1]));
assert.equal(canonicalize({ 2: 'two', 10: 'ten' }), '{"10":"ten","2":"two"}');
const invalidJson = [undefined, NaN, Infinity, 1n, new Date(), () => {}, Symbol('x')];
for (const value of invalidJson) assert.throws(() => canonicalize(value), /JSON/);
assert.throws(() => canonicalize({ unknown: undefined }), /JSON/);
assert.throws(() => canonicalize([, 1]), /Sparse/);
assert.throws(() => canonicalize({ get value() { throw new Error('must not execute'); } }), /accessors/);
const accessorArray = [0];
Object.defineProperty(accessorArray, '0', { get() { throw new Error('must not execute'); } });
assert.throws(() => canonicalize(accessorArray), /accessors/);
const cyclic = {}; cyclic.self = cyclic;
assert.throws(() => canonicalize(cyclic), /Cyclic/);
let nested = {}; for (let i = 0; i < 65; i += 1) nested = { child: nested };
assert.throws(() => canonicalize(nested), /nesting/);
assert.equal(canonicalize(JSON.parse('{"__proto__":{"x":1},"z":2}')), '{"__proto__":{"x":1},"z":2}');

const valid = message();
assert.equal(valid.protocol, PROTOCOL);
assert.deepEqual(validateMessage(valid, { now: NOW }), valid);
assert.notEqual(validateMessage(valid, { now: NOW }), valid);
assert.throws(() => validateMessage({ ...valid, protocol: 'genos.evidence/v2' }, { now: NOW }), /contract/);
assert.throws(() => validateMessage({ ...valid, type: 'PROMOTE' }, { now: NOW }), /contract/);
assert.throws(() => validateMessage({ ...valid, surprise: true }, { now: NOW }), /contract/);
assert.throws(() => validateMessage({ ...valid, payload: { claim: claim({ claimId: 'tampered' }) } }, { now: NOW }), /digest/);
assert.throws(() => validateMessage(valid, { now: valid.expiresAt }), /expired/);
assert.throws(() => validateMessage(valid, { now: '2026-11-01T10:00:00Z' }), /future/);
assert.throws(() => message({ expiresAt: NOW }), /expiry/);
assert.throws(() => validateMessage(valid, { now: 'invalid' }), /clock/);
assert.throws(() => validateMessage({ ...valid, createdAt: '2026-11-01T23:59:60Z' }, { now: NOW }), { code: 'EVIDENCE_TIME_INVALID' });
assert.throws(() => validateMessage({ ...valid, expiresAt: '2026-12-31T23:59:60Z' }, { now: NOW }), { code: 'EVIDENCE_TIME_INVALID' });
assert.throws(() => message({ generations: { incarnation: -1, organization: 2, workspace: 3 } }), /contract/);
assert.throws(() => message({ sender: { agentId: 'producer' } }), /contract/);
assert.throws(() => message({ scope: { organizationId: 'org' } }), /contract/);
assert.throws(() => validateClaim(claim({ subject: { artifactDigest: digest('candidate') } })), /contract/);
assert.throws(() => validateClaim(claim({ predicate: { command: 'node --version' } })), /contract/);
assert.throws(() => validateClaim(claim({ predicate: { command: 'node --version', expectedExitCode: 300 } })), /contract/);
assert.throws(() => validateClaim(claim({ evidence: ['result', 'result'] })), /contract/);
assert.throws(() => validateClaim(claim({ provenance: { producerId: 'producer' } })), /contract/);
for (const invalidId of [' root', 'root ', '\troot', 'root\t', '\nroot', 'root\n', 'root\r\n', 'root\u00a0']) {
  assert.throws(() => validateClaim(claim({ claimId: invalidId })), /contract/);
  assert.throws(() => validateClaim(claim({ dependencies: [invalidId] })), /contract/);
  assert.throws(() => message({ messageId: invalidId }), /contract/);
  assert.throws(() => message({ sender: { ...valid.sender, agentId: invalidId } }), /contract/);
}
assert.equal(validateClaim(claim({ claimId: 'r' })).claimId, 'r');
assert.equal(validateClaim(claim({ claimId: 'root child' })).claimId, 'root child');
for (const type of MESSAGE_TYPES.filter((entry) => entry !== 'ASSERT')) {
  let payload = { claimId: 'claim-1' };
  if (type === 'COUNTEREXAMPLE') payload = { ...payload, counterexampleResultId: 'result-1', domainFingerprint: digest('domain') };
  if (['INVALIDATE_DEPENDENTS', 'ACK_APPLIED'].includes(type)) payload.revisionMessageId = 'revision-1';
  assert.equal(message({ type, payload }).type, type);
  assert.throws(() => message({ type, payload: {} }), /contract/);
  assert.throws(() => message({ type, payload: { ...payload, surprise: true } }), /contract/);
}
assert.throws(() => validateMessage(valid, { now: valid.expiresAt }), { code: 'EVIDENCE_EXPIRED' });
assert.throws(() => validateMessage({ ...valid, protocol: 'unknown' }, { now: NOW }), { code: 'EVIDENCE_SCHEMA_INVALID' });
console.log('EVIDENCE portable contract, canonical vectors and fail-closed inputs: PASS');
