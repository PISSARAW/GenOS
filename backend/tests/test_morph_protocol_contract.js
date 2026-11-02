'use strict';

const assert = require('node:assert/strict');
const { digest, canonicalize } = require('../src/services/evidenceProtocol/canonical');
const { PROTOCOL, MESSAGE_TYPES, validateMessage, validatePlan, validateSnapshot } = require('../src/services/morphProtocol/contract');
const fixture = require('./helpers/morphContractFixture');

for (const type of MESSAGE_TYPES) {
  const value = fixture.message(type);
  assert.equal(value.protocol, PROTOCOL);
  assert.equal(value.payloadDigest, digest(value.payload));
  assert.deepEqual(validateMessage(value, { now: fixture.NOW }), value);
  assert.throws(() => fixture.message(type, { payload: {} }), { code: 'MORPH_SCHEMA_INVALID' });
  assert.throws(() => fixture.message(type, { payload: { ...value.payload, extra: true } }), /contract/);
  const missing = { ...value }; delete missing.audience;
  assert.throws(() => validateMessage(missing, { now: fixture.NOW }), /contract/);
}
const value = fixture.message();
assert.throws(() => validateMessage({ ...value, protocol: 'genos.continuity/v1' }, { now: fixture.NOW }), /contract/);
assert.throws(() => validateMessage({ ...value, payload: { plan: fixture.plan({ transitionId: 'tampered' }) } }, { now: fixture.NOW }), /digest/);
assert.throws(() => validateMessage({ ...value, createdAt: '2026-11-01T23:59:60Z' }, { now: fixture.NOW }), { code: 'MORPH_TIME_INVALID' });
assert.throws(() => validateMessage({ ...value, expiresAt: '2026-12-31T23:59:60Z' }, { now: fixture.NOW }), { code: 'MORPH_TIME_INVALID' });
assert.throws(() => validateMessage(value, { now: value.expiresAt }), { code: 'MORPH_EXPIRED' });
assert.throws(() => validateMessage(value, { now: 'invalid' }), { code: 'MORPH_CLOCK_INVALID' });
assert.throws(() => validateSnapshot(fixture.snapshot({ topology: 'unknown' })), /contract/);
assert.throws(() => validatePlan(fixture.plan({ sourceVersion: Number.MAX_SAFE_INTEGER + 1 })), /contract/);
assert.throws(() => fixture.message('PROPOSE', { payload: undefined }), { code: 'MORPH_JSON_INVALID' });
for (const invalid of [' x', 'x ', 'x\n', 'x\t', 'x\r\n', 'x\u00a0']) {
  assert.throws(() => validatePlan(fixture.plan({ transitionId: invalid })), /contract/);
}
const snapshot = fixture.snapshot();
delete snapshot.permissions[0].conditions;
assert.throws(() => validateSnapshot(snapshot), /contract/);
assert.equal(validatePlan(fixture.plan({ targetVersion: 99 })).targetVersion, 99);
for (const vector of require('../../shared/morphProtocol.v1.vectors.json')) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
}
console.log('MORPH portable contract, exact payloads and canonical vectors: PASS');
