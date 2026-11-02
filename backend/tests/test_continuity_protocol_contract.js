'use strict';

const assert = require('node:assert/strict');
const { digest, canonicalize } = require('../src/services/evidenceProtocol/canonical');
const { PROTOCOL, MESSAGE_TYPES, validateMessage, validateIdentity, validateBundle } = require('../src/services/continuityProtocol/contract');
const { NOW, identity, bundle, message } = require('./helpers/continuityContractFixture');

for (const type of MESSAGE_TYPES) {
  const value = message(type);
  assert.equal(value.protocol, PROTOCOL);
  assert.equal(value.payloadDigest, digest(value.payload));
  assert.deepEqual(validateMessage(value, { now: NOW }), value);
  assert.throws(() => message(type, { payload: {} }), { code: 'CONTINUITY_SCHEMA_INVALID' });
  assert.throws(() => message(type, { payload: { ...value.payload, extra: true } }), /contract/);
  const missing = { ...value }; delete missing.audience;
  assert.throws(() => validateMessage(missing, { now: NOW }), /contract/);
}
const value = message();
assert.throws(() => validateMessage({ ...value, protocol: 'genos.evidence/v1' }, { now: NOW }), /contract/);
assert.throws(() => validateMessage({ ...value, payload: { ...value.payload, relation: 'fork' } }, { now: NOW }), /digest/);
assert.throws(() => validateMessage({ ...value, createdAt: '2026-11-01T23:59:60Z' }, { now: NOW }), { code: 'CONTINUITY_TIME_INVALID' });
assert.throws(() => validateMessage({ ...value, expiresAt: '2026-12-31T23:59:60Z' }, { now: NOW }), { code: 'CONTINUITY_TIME_INVALID' });
assert.throws(() => validateMessage(value, { now: value.expiresAt }), { code: 'CONTINUITY_EXPIRED' });
assert.throws(() => validateMessage(value, { now: 'invalid' }), { code: 'CONTINUITY_CLOCK_INVALID' });
assert.throws(() => message('CHALLENGE', { payload: { ...message('CHALLENGE').payload, challengeExpiresAt: '2026-12-31T23:59:60Z' } }), /timestamp/);
assert.throws(() => message('ATTEST', { payload: { ...message('ATTEST').payload, nonce: 'short' } }), /contract/);
assert.throws(() => message('PRESENT', { payload: undefined }), { code: 'CONTINUITY_JSON_INVALID' });
for (const bad of [' x', 'x ', 'x\n', 'x\t', 'x\r\n', 'x\u00a0']) {
  assert.throws(() => validateIdentity(identity({ branchId: bad })), /contract/);
  assert.throws(() => message('PRESENT', { audience: { ...value.audience, agentId: bad } }), /contract/);
}
assert.throws(() => validateIdentity({ ...identity(), authority: 'inherited' }), /contract/);
assert.throws(() => validateBundle(bundle({ permissions: ['resource-1', 'resource-1'] })), /contract/);
assert.throws(() => validateBundle(bundle({ budget: { unit: 'tokens', limit: 1, spent: -1, reserved: 0 } })), /contract/);
assert.throws(() => validateBundle(bundle({ budget: { unit: 'tokens', limit: 1, spent: 1, reserved: 1 } })), { code: 'CONTINUITY_BUNDLE_INVALID' });
assert.throws(() => validateBundle(bundle({ evidenceRefs: [] })), /obligation evidence missing/);
assert.throws(() => message('OFFER_HANDOFF', { payload: { ...message('OFFER_HANDOFF').payload, bundle: bundle({ evidenceRefs: [] }) } }), /obligation evidence missing/);
for (const field of ['obligations', 'unknownEffects']) {
  const original = bundle();
  const duplicate = { ...original[field][0], owner: { agentId: 'other', incarnationId: 'other-1', trustDomain: 'local' } };
  const invalid = bundle({ [field]: [...original[field], duplicate] });
  assert.throws(() => validateBundle(invalid), { code: 'CONTINUITY_BUNDLE_INVALID' });
  assert.throws(() => message('OFFER_HANDOFF', { payload: { ...message('OFFER_HANDOFF').payload, bundle: invalid } }), /duplicate/);
}
const vectors = require('../../shared/continuityProtocol.v1.vectors.json');
for (const vector of vectors) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
}
console.log('CONTINUITY portable contract, exact payloads and canonical vectors: PASS');
