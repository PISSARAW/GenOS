'use strict';

const assert = require('node:assert/strict');
const { digest, canonicalize } = require('../src/services/evidenceProtocol/canonical');
const { PROTOCOL, MESSAGE_TYPES, validateMessage, validateContext, validateState, validateRepresentation } = require('../src/services/synapseProtocol/contract');
const fixture = require('./helpers/synapseContractFixture');

for (const type of MESSAGE_TYPES) {
  const value = fixture.message(type);
  assert.equal(value.protocol, PROTOCOL);
  assert.deepEqual(validateMessage(value, { now: fixture.NOW }), value);
  assert.throws(() => fixture.message(type, { payload: {} }), { code: 'SYNAPSE_SCHEMA_INVALID' });
  assert.throws(() => fixture.message(type, { payload: { ...value.payload, extra: true } }), /contract/);
}
const value = fixture.message();
assert.throws(() => validateMessage({ ...value, expiresAt: '2026-12-31T23:59:60Z' }, { now: fixture.NOW }), { code: 'SYNAPSE_TIME_INVALID' });
assert.throws(() => validateMessage({ ...value, createdAt: '2026-11-01T23:59:60Z' }, { now: fixture.NOW }), { code: 'SYNAPSE_TIME_INVALID' });
assert.throws(() => validateMessage(value, { now: value.expiresAt }), { code: 'SYNAPSE_EXPIRED' });
assert.throws(() => validateContext(fixture.context({ dictionary: { snapshot: fixture.dictionary(), digest: digest('other') } })), /dictionary digest/);
assert.throws(() => validateContext(fixture.context({ dictionary: { snapshot: null, digest: digest('other') } })), /must agree/);
const foreign = fixture.dictionary(); foreign.domain = 'foreign';
assert.throws(() => validateContext(fixture.context({ dictionary: { snapshot: foreign, digest: digest(foreign) } })), /domain or participants/);
assert.throws(() => validateState(JSON.parse('{"__proto__":{"polluted":true}}')), /contract/);
assert.throws(() => validateState({ counter: Infinity }), /JSON/);
assert.throws(() => validateState({ note: 'a'.repeat(1024 * 1024) }), /1 MiB/);
assert.throws(() => validateRepresentation({ encoding: 'canonical', operations: [{ kind: 'put', key: 'counter' }] }), /contract/);
assert.throws(() => validateRepresentation({ encoding: 'canonical', operations: [{ kind: 'remove', key: 'counter', value: 0 }] }), /contract/);
assert.throws(() => fixture.message('OFFER_DELTA', { payload: { delta: { ...fixture.delta(), operations: [] }, representation: fixture.representation() } }), /contract/);
for (const invalid of [' x', 'x ', 'x\n', 'x\t', 'x\r\n', 'x\u00a0']) {
  assert.throws(() => validateContext(fixture.context({ contextId: invalid })), /contract/);
}
for (const vector of require('../../shared/synapseProtocol.v1.vectors.json')) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
}
console.log('SYNAPSE portable context, immutable delta commitment and separate representations: PASS');
