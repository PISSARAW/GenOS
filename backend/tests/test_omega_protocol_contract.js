'use strict';

const assert = require('node:assert/strict');
const interop = require('../src/services/cognitiveOmegaInteropService');
const { digest, canonicalize } = require('../src/services/evidenceProtocol/canonical');
const { PROTOCOL, MESSAGE_TYPES, validateMessage, validateCapabilities, validateProgram, validateSubmission } = require('../src/services/omegaProtocol/contract');
const fixture = require('./helpers/omegaProtocolContractFixture');

for (const type of MESSAGE_TYPES) {
  const value = fixture.message(type);
  assert.equal(value.protocol, PROTOCOL);
  assert.equal(value.payloadDigest, digest(value.payload));
  assert.deepEqual(validateMessage(value, { now: fixture.NOW }), value);
  assert.throws(() => fixture.message(type, { payload: {} }), { code: 'OMEGA_SCHEMA_INVALID' });
  assert.throws(() => fixture.message(type, { payload: { ...value.payload, extra: true } }), /contract/);
}
const value = fixture.message();
assert.throws(() => validateMessage({ ...value, protocol: 'genos.gcir.omega/v1' }, { now: fixture.NOW }), /contract/);
assert.throws(() => validateMessage({ ...value, createdAt: '2026-11-01T23:59:60Z' }, { now: fixture.NOW }), { code: 'OMEGA_TIME_INVALID' });
assert.throws(() => validateMessage({ ...value, expiresAt: '2026-12-31T23:59:60Z' }, { now: fixture.NOW }), { code: 'OMEGA_TIME_INVALID' });
assert.throws(() => validateMessage(value, { now: value.expiresAt }), { code: 'OMEGA_EXPIRED' });
assert.throws(() => validateMessage({ ...value, payload: { runtimeId: 'other' } }, { now: fixture.NOW }), /digest/);
assert.throws(() => fixture.message('DESCRIBE_RUNTIME', { payload: undefined }), { code: 'OMEGA_JSON_INVALID' });
const program = fixture.program();
assert.deepEqual(validateProgram(program), interop.read(program));
assert.equal(interop.digest(interop.decode(interop.encode(program))), interop.digest(program));
assert.notEqual(interop.digest(program), digest(program));
const missing = fixture.program(); delete missing.payload.requests.check;
assert.throws(() => validateProgram(missing), /every operation/);
const fakeResult = fixture.program(); fakeResult.payload.results = { check: { verified: true } };
assert.throws(() => validateProgram(fakeResult), /contract/);
const wrongRequest = fixture.program(); wrongRequest.payload.requests.read = { predicate: 'true' };
assert.throws(() => validateProgram(wrongRequest), /contract/);
const settled = fixture.program(); settled.operations[0].state = 'satisfied';
assert.throws(() => validateProgram(settled), /contract/);
const duplicate = fixture.program(); duplicate.operations.push(duplicate.operations[0]);
assert.throws(() => validateProgram(duplicate), { code: 'OMEGA_PROGRAM_INVALID' });
assert.throws(() => validateCapabilities(fixture.capabilities({ operations: [fixture.capabilities().operations[0], fixture.capabilities().operations[0]] })), /contract|duplicate/);
assert.throws(() => validateSubmission(fixture.submission({ budget: { unit: 'tokens', limit: 1, spent: 1, reserved: 1 } })), /budget/);
for (const invalid of [' x', 'x ', 'x\n', 'x\t', 'x\r\n', 'x\u00a0']) {
  assert.throws(() => validateSubmission(fixture.submission({ planId: invalid })), /contract/);
}
for (const vector of require('../../shared/omegaExecutionProtocol.v1.vectors.json')) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
}
console.log('OMEGA Execution contract, real MessagePack program validation and bounded requests: PASS');
