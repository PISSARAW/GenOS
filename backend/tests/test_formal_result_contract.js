'use strict';

const assert = require('node:assert/strict');
const { unpack, pack } = require('msgpackr');
const {
  CONTRACT_VERSION,
  MEDIA_TYPE,
  createFormalResult,
  encodeFormalResult,
  decodeFormalResult,
} = require('../src/services/formalResultService');

function fixture(overrides = {}) {
  const lemmaHash = `sha256:${'a'.repeat(64)}`;
  const semanticHash = `sha256:${'b'.repeat(64)}`;
  const sourceHash = `sha256:${'c'.repeat(64)}`;
  const inputHash = `sha256:${'d'.repeat(64)}`;
  return {
    canonicalStatement: 'Pour tout entier pair n > 2, il existe deux nombres premiers de somme n.',
    assumptions: [{ id: 'A1', statement: 'L’arithmétique est interprétée dans les entiers naturels.' }],
    validityDomain: { statement: 'Entiers naturels pairs strictement supérieurs à 2.', constraints: ['n est pair', 'n > 2'] },
    dependencies: [{ resultId: lemmaHash, semanticFingerprint: semanticHash, relation: 'uses' }],
    status: 'tested',
    evidence: {
      kind: 'reproducible_artifact',
      content: { testedThrough: 100000, result: 'no-counterexample' },
      reproduction: { command: 'node verify.mjs --limit 100000', environment: 'node-22' },
    },
    provenance: {
      createdAt: '2026-09-19T10:00:00.000Z',
      actor: 'agent:researcher-1',
      source: { type: 'experiment', uri: 'genos://experiments/goldbach-1', digest: sourceHash },
      inputs: [{ id: 'dataset:primes', digest: inputHash }],
      transformations: ['normalize-statement', 'execute-verifier'],
    },
    producer: { model: 'gpt-6-astra', version: '2026-09-19' },
    ...overrides,
  };
}

function testRoundTrip() {
  const result = createFormalResult(fixture());
  const frame = encodeFormalResult(result);
  const decoded = decodeFormalResult(frame);
  assert.deepEqual(decoded, result);
  assert.equal(decoded.contractVersion, CONTRACT_VERSION);
  assert.match(decoded.semanticFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(decoded.resultId, /^sha256:[a-f0-9]{64}$/);
  assert.equal(MEDIA_TYPE, 'application/vnd.genos.formal-result+msgpack');
}

function testCanonicalIdentity() {
  const left = fixture({ evidence: { kind: 'proof', content: { z: 2, a: 1 } } });
  const right = fixture({ evidence: { kind: 'proof', content: { a: 1, z: 2 } } });
  assert.equal(createFormalResult(left).resultId, createFormalResult(right).resultId);
  const changedProducer = createFormalResult(fixture({ producer: { model: 'other-model', version: '1' } }));
  const baseline = createFormalResult(fixture());
  assert.equal(changedProducer.semanticFingerprint, baseline.semanticFingerprint);
  assert.notEqual(changedProducer.resultId, baseline.resultId);
}

function testBinaryDensity() {
  const result = createFormalResult(fixture());
  const frame = encodeFormalResult(result);
  assert.ok(frame.length < Buffer.byteLength(JSON.stringify(result)), `${frame.length} should be smaller than JSON`);
}

function testTamperDetection() {
  const frame = encodeFormalResult(fixture());
  const tuple = unpack(frame.subarray(4));
  tuple[1] = 'Énoncé altéré';
  const tampered = Buffer.concat([frame.subarray(0, 4), pack(tuple)]);
  assert.throws(() => decodeFormalResult(tampered), /fingerprint mismatch/i);
}

function testValidation() {
  assert.throws(() => createFormalResult(fixture({ status: 'probably_true' })), /status must be one of/);
  assert.throws(() => createFormalResult(fixture({ status: 'verified' })), /requires proof/);
  assert.throws(() => createFormalResult(fixture({ status: 'refuted' })), /requires counterexample/);
  assert.throws(() => createFormalResult(fixture({ producer: { model: 'gpt-6-astra' } })), /producer.version/);
  assert.throws(() => createFormalResult(fixture({ evidence: { kind: 'reproducible_artifact', content: 'x' } })), /reproduction is required/);
  assert.throws(() => createFormalResult(fixture({ evidence: { kind: 'reproducible_artifact', content: 'x', reproduction: {} } })), /reproduction.command/);
  assert.throws(() => decodeFormalResult(Buffer.from('{}')), /magic/);
}

testRoundTrip();
testCanonicalIdentity();
testBinaryDensity();
testTamperDetection();
testValidation();
console.log('Formal result MessagePack contract passed.');
