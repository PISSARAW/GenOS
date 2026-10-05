'use strict';

const assert = require('node:assert/strict');
const msgpack = require('msgpackr');
const vectors = require('../../spec/g-cir-omega-vectors.json');
const compatibility = require('../../spec/g-cir-omega-compatibility.json');
const interop = require('../src/services/cognitiveOmegaInteropService');

for (const vector of vectors.vectors) {
  const checked = interop.validate(vector.envelope);
  assert.equal(checked.valid, true, vector.name);
  const bytes = interop.encode(vector.envelope);
  assert.equal(bytes.toString('hex'), vector.messagePackHex, vector.name);
  assert.equal(interop.digest(vector.envelope), vector.sha256, vector.name);
  assert.deepEqual(interop.decode(bytes), vector.envelope, vector.name);
}

assert.equal(interop.validate({ ...vectors.vectors[0].envelope, operations: [
  vectors.vectors[0].envelope.operations[0], vectors.vectors[0].envelope.operations[0]
] }).valid, false);
assert.deepEqual(interop.SUPPORTED_VERSIONS, compatibility.supportedVersions);
assert.deepEqual(interop.READABLE_VERSIONS, compatibility.readableVersions);
assert.throws(() => interop.encode({ ...vectors.vectors[0].envelope, version: 2 }),
  (error) => error.code === 'omega.version_unsupported');
assert.throws(() => interop.decode(Buffer.from('00', 'hex')),
  (error) => error.code === 'omega.frame_invalid');
const legacy = interop.read({ version: 0, schema: 'genos.gcir.omega/v0', id: 'legacy',
  ops: [{ name: 'read', type: 'READ', ref: 'repo', deps: [], status: 'open' }],
  permissions: { read: ['repo'] }, context: { migrated: true } });
assert.equal(legacy.schema, interop.SCHEMA);
assert.equal(legacy.version, 1);
assert.equal(legacy.operations[0].reference, 'repo');
const legacyFrame = msgpack.encode(['genos.gcir.omega/v0', 0, 'legacy-frame',
  [['read', 'READ', 'repo', [], 'open']], [['read', ['repo']]], null]);
assert.equal(interop.decode(legacyFrame).version, 1);
assert.throws(() => interop.encode({ ...legacy, version: 0, schema: 'genos.gcir.omega/v0' }),
  (error) => error.code === 'omega.schema_unsupported');
const invalidPayloadFrame = msgpack.encode([
  vectors.vectors[0].envelope.schema, 1, 'invalid-payload', [], [], '{invalid-json}'
]);
assert.throws(() => interop.decode(invalidPayloadFrame),
  (error) => error.code === 'omega.payload_invalid');
const fuzz = interop.fuzzDecode(Buffer.from(vectors.vectors[0].messagePackHex, 'hex'));
assert.equal(fuzz.iterations, 256);
assert.equal(interop.fuzzCampaign({ seed: 20261005, iterations: 8 }).status, 'passed');
const nondeterministicCampaign = interop.fuzzCampaign({ iterations: 8 });
assert.equal(nondeterministicCampaign.status, 'passed');
for (const row of compatibility.matrix.filter((item) => item.expected === 'reject')) {
  assert.equal(typeof row.error, 'string');
}
console.log('G-CIR Omega Node interop checks passed.');
