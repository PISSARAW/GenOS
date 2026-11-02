'use strict';

const assert = require('node:assert/strict');
const { digest, canonicalize } = require('../src/services/evidenceProtocol/canonical');
const metadata = require('../src/services/gqwf/metadataStore');
const { createManifest } = require('../src/services/gqwf/manifest');
const { PROTOCOL, MESSAGE_TYPES, validateMessage, validateWorldShape, validateCandidate } = require('../src/services/gqwfExchange/contract');
const fixture = require('./helpers/gqwfExchangeContractFixture');

for (const type of MESSAGE_TYPES) {
  const value = fixture.message(type);
  assert.equal(value.protocol, PROTOCOL);
  assert.equal(value.payloadDigest, digest(value.payload));
  assert.deepEqual(validateMessage(value, { now: fixture.NOW }), value);
  assert.throws(() => fixture.message(type, { payload: {} }), { code: 'GQWF_EXCHANGE_SCHEMA_INVALID' });
  assert.throws(() => fixture.message(type, { payload: { ...value.payload, extra: true } }), /contract/);
}
const value = fixture.message();
assert.throws(() => validateMessage({ ...value, protocol: 'gqwf-cas-replication-v1' }, { now: fixture.NOW }), /contract/);
assert.throws(() => validateMessage({ ...value, createdAt: '2026-11-01T23:59:60Z' }, { now: fixture.NOW }), { code: 'GQWF_EXCHANGE_TIME_INVALID' });
assert.throws(() => validateMessage({ ...value, expiresAt: '2026-12-31T23:59:60Z' }, { now: fixture.NOW }), { code: 'GQWF_EXCHANGE_TIME_INVALID' });
assert.throws(() => validateMessage(value, { now: value.expiresAt }), { code: 'GQWF_EXCHANGE_EXPIRED' });
assert.throws(() => validateMessage({ ...value, payload: { world: fixture.world({ worldId: 'other' }) } }, { now: fixture.NOW }), /digest/);
assert.throws(() => validateWorldShape(fixture.world({ rootHash: digest('not-native') })), /contract/);
assert.throws(() => validateCandidate(fixture.candidate({ worldDigest: fixture.world().rootHash })), /contract/);
assert.throws(() => fixture.message('TRANSFER', { payload: { ...fixture.payload('TRANSFER'), bytesBase64: 'Zg=' } }), /canonical base64/);
assert.throws(() => fixture.message('TRANSFER', { payload: { ...fixture.payload('TRANSFER'), bytesBase64: 'Zh==' } }), /canonical base64/);
assert.throws(() => fixture.message('TRANSFER', { payload: { ...fixture.payload('TRANSFER'), bytesBase64: '%%%=' } }), /contract/);
assert.throws(() => validateCandidate(fixture.candidate({ predicate: { command: 'node check.js', expectedExitCode: 0 } })), /contract/);
assert.throws(() => validateCandidate(fixture.candidate({ predicate: { command: fixture.world().closure.command } })), /contract/);
for (const invalid of [' x', 'x ', 'x\n', 'x\t', 'x\r\n', 'x\u00a0']) {
  assert.throws(() => validateWorldShape(fixture.world({ worldId: invalid })), /contract/);
}
for (const vector of require('../../shared/gqwfExchangeProtocol.v1.vectors.json')) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
  if (vector.nativeSerialized) {
    assert.equal(metadata.digest(vector.nativeSerialized), vector.nativeRawDigest);
    assert.equal(createManifest([]).hash, vector.nativeRawDigest);
  }
}
console.log('GQWF Exchange portable contract, native hashes, command objects and canonical transfers: PASS');
