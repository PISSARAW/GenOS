'use strict';

const assert = require('node:assert/strict');
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');

const runtime = createRuntime();
runtime.registerReader('repo', async () => ({ files: ['auth.js', 'README.md'] }));
runtime.registerSelector('auth_slice', async ({ input }) => input.files.filter((file) => file.includes('auth')));
runtime.registerTool('scan', async ({ arguments: files }) => ({ files, finding: 'candidate' }));
runtime.registerVerifier('reproducer', async ({ candidate }) => ({
  status: candidate.finding === 'candidate' ? 'verified' : 'rejected', valid: candidate.finding === 'candidate'
}));
runtime.registerEmitter('publish', async ({ value }) => ({ published: value.finding }));

const operations = [
  { id: 'read', kind: 'READ', reference: 'repo', dependsOn: [] },
  { id: 'select', kind: 'SELECT', reference: 'auth_slice', dependsOn: ['read'] },
  { id: 'call', kind: 'CALL', reference: 'scan', input: { scope: 'auth' }, arguments: ['auth.js'], dependsOn: ['select'] },
  { id: 'check', kind: 'CHECK', reference: 'reproducer', dependsOn: ['call'] },
  { id: 'emit', kind: 'EMIT', reference: 'publish', dependsOn: ['check'] }
];
const policy = { read: ['repo'], select: ['auth_slice'], call: ['scan'], check: ['reproducer'], emit: ['publish'] };

(async () => {
  const result = await runtime.execute({ operations, policy, allowEmit: true });
  assert.equal(result.status, 'emitted');
  assert.equal(result.results.find((item) => item.kind === 'CHECK').status, 'verified');
  assert.deepEqual(result.values.emit, { published: 'candidate' });
  const denied = await runtime.execute({ operations, policy: { ...policy, emit: [] }, allowEmit: true });
  assert.equal(denied.reason, 'emit_not_authorized');
  console.log('G-CIR Omega runtime checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
