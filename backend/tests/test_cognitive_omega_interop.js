'use strict';

const assert = require('node:assert/strict');
const vectors = require('../../spec/g-cir-omega-vectors.json');
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
console.log('G-CIR Omega Node interop checks passed.');
