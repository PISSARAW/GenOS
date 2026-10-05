'use strict';

const assert = require('node:assert/strict');
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');

const runtime = createRuntime();
runtime.registerReader('repo', async () => ({ files: ['auth.js', 'README.md'] }));
runtime.registerSelector('auth_slice', async ({ input }) => input.files.filter((file) => file.includes('auth')));
runtime.registerTool('scan', async ({ arguments: files }) => ({ files, finding: 'candidate' }));
runtime.registerInferer('model/test', async ({ input, operation }) => ({
  finding: input.finding, model: operation.reference, confidence: 0.9
}));
runtime.registerVerifier('reproducer', async ({ candidate }) => ({
  status: candidate.finding === 'candidate' && candidate.confidence === 0.9 ? 'verified' : 'rejected',
  valid: candidate.finding === 'candidate' && candidate.confidence === 0.9
}));
runtime.registerEmitter('publish', async ({ value }) => ({ published: value.finding }));

const operations = [
  { id: 'read', kind: 'READ', reference: 'repo', dependsOn: [] },
  { id: 'select', kind: 'SELECT', reference: 'auth_slice', dependsOn: ['read'] },
  { id: 'call', kind: 'CALL', reference: 'scan', input: { scope: 'auth' }, arguments: ['auth.js'], dependsOn: ['select'] },
  { id: 'infer', kind: 'INFER', reference: 'model/test', dependsOn: ['call'] },
  { id: 'check', kind: 'CHECK', reference: 'reproducer', dependsOn: ['infer'] },
  { id: 'emit', kind: 'EMIT', reference: 'publish', dependsOn: ['check'] }
];
const policy = { read: ['repo'], select: ['auth_slice'], call: ['scan'], infer: ['model/test'],
  check: ['reproducer'], emit: ['publish'] };

(async () => {
  const result = await runtime.execute({ operations, policy, allowEmit: true });
  assert.equal(result.status, 'emitted');
  assert.equal(result.results.find((item) => item.kind === 'INFER').status, 'ready');
  assert.equal(result.results.find((item) => item.kind === 'CHECK').status, 'verified');
  assert.deepEqual(result.values.emit, { published: 'candidate' });
  const denied = await runtime.execute({ operations, policy: { ...policy, emit: [] }, allowEmit: true });
  assert.equal(denied.reason, 'emit_not_authorized');
  const missing = await runtime.execute({ operations, policy: { ...policy, infer: [] }, allowEmit: true });
  assert.equal(missing.reason, 'infer_not_authorized');
  const mmuRuntime = createRuntime();
  const paged = await mmuRuntime.execute({
    operations: [{ id: 'read_paged', kind: 'READ', reference: '@repo/missing', dependsOn: [] }],
    policy: { read: ['@repo/missing'] },
    mmu: { need: async () => ({ status: 'page_in', page: { value: { loaded: true } } }) }
  });
  assert.deepEqual(paged.values.read_paged, { loaded: true });
  console.log('G-CIR Omega runtime checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
