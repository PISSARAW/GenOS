'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'omega-check-test-secret';
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');
const { createRegistry } = require('../src/services/cognitiveEpistemicCheckService');

const registry = createRegistry();
registry.register('schema', { type: 'schema', schema: 'common-ground.schema.json' });
registry.register('test', { type: 'test', test: { command: 'echo verified' } });
registry.register('smt', { type: 'smt', command: 'echo smt-checked' });
registry.register('lean', { type: 'lean', source: 'theorem demo : 1 = 1 := by rfl', toolchainVersion: 'missing-lean' });

const runtime = createRuntime();
const operations = [
  { id: 'schema_check', kind: 'CHECK', reference: 'schema', input: {
    agentA: 'a', agentB: 'b', domain: 'runtime', semanticFingerprint: 'sha256:abc',
    status: 'grounded', confidence: 1
  }, dependsOn: [] },
  { id: 'test_check', kind: 'CHECK', reference: 'test', dependsOn: ['schema_check'] },
  { id: 'smt_check', kind: 'CHECK', reference: 'smt', dependsOn: ['test_check'] }
];

(async () => {
  const result = await runtime.execute({ operations, verifierRegistry: registry,
    policy: { check: ['schema', 'test', 'smt'] } });
  assert.equal(result.status, 'emitted');
  assert.equal(result.results.every((item) => item.status === 'verified'), true);
  assert.equal(result.results.every((item) => item.receipt?.signature), true);

  const rejected = await runtime.execute({ operations, verifierRegistry: registry,
    policy: { check: ['schema', 'test', 'smt'] }, objects: {}, });
  assert.equal(rejected.status, 'emitted');
  const invalid = await runtime.execute({ operations: [{ ...operations[0], input: { agentA: 'a' } }],
    verifierRegistry: registry, policy: { check: ['schema'] } });
  assert.equal(invalid.reason, 'verification_failed');
  const defaultRuntime = createRuntime();
  const defaultResult = await defaultRuntime.execute({
    operations: [{ ...operations[0], verificationDescriptor: {
      type: 'schema', schema: 'common-ground.schema.json'
    } }], policy: { check: ['schema'] }
  });
  assert.equal(defaultResult.status, 'emitted');
  assert.equal(defaultResult.results[0].receipt?.signature !== undefined, true);
  console.log('Cognitive epistemic CHECK checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
