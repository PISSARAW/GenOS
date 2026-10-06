'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { createMmu } = require('../src/services/cognitiveMmuService');
const { createLedger } = require('../src/services/cognitiveVisibilityLedger');
const { createWorkingSet } = require('../src/services/cognitiveWorkingSetService');
const persistent = require('../src/services/cognitivePersistentVisibilityLedger');
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');
const procedures = require('../src/services/proceduralCompilationService');
const economy = require('../src/services/cognitiveEconomyControllerService');
const schema = require('../src/services/cognitiveOmegaSchemaCheck');
const router = require('../src/services/modelRouter');
const runner = require('../src/services/modelRouteRunner');

async function mmuPermissions() {
  let allowed = false;
  let resolutions = 0;
  const ledger = createLedger();
  const mmu = createMmu({ ledger, workingSet: createWorkingSet(), authorize: async () => allowed,
    resolvers: { secret: async ({ sessionId }) => ({ value: { sessionId, revision: ++resolutions } }) } });
  const request = { sessionId: 'a', objectId: 'secret', scope: 'project' };
  assert.equal((await mmu.need(request)).reason, 'mmu_permission_denied');
  assert.equal(resolutions, 0);
  allowed = true;
  assert.equal((await mmu.need(request)).status, 'page_in');
  assert.equal((await mmu.need(request)).source, 'working_set');
  ledger.materialize({ ...request, value: 'replacement-at-same-revision' });
  assert.equal((await mmu.need(request)).status, 'page_in');
  allowed = false;
  assert.equal((await mmu.need(request)).reason, 'mmu_permission_denied');
  allowed = true;
  assert.equal((await mmu.need({ ...request, sessionId: 'b' })).page.value.sessionId, 'b');
  ledger.invalidate({ sessionId: 'b', objectIds: ['secret'] });
  assert.equal((await mmu.need({ ...request, sessionId: 'b' })).status, 'page_in');
  assert.equal((await ledger.visible({ ...request, scope: 'another' })).visible, false);
}

async function expiryAndIntegrity() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const key = { sessionId: 'a', objectId: 'secret', scope: 'project' };
    await persistent.materialize(db, { ...key, value: 'x', expiresAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal((await persistent.visible(db, key)).visible, false);
    assert.equal((await db.get('SELECT valid FROM cognitive_visibility_fragments')).valid, 0);
    await persistent.materialize(db, { ...key, value: 'fresh' });
    assert.equal((await persistent.visible(db, { ...key, scope: 'another' })).visible, false);
    await db.run("UPDATE cognitive_visibility_fragments SET object_digest = 'tampered'");
    await assert.rejects(persistent.visible(db, key), /digest_mismatch/);
  } finally { await db.close(); }
}

async function proofGates() {
  const runtime = createRuntime();
  let emitted = 0;
  runtime.registerEmitter('effect', () => ++emitted);
  const check = { id: 'check', kind: 'CHECK', reference: 'verifier', input: { candidate: 'a' } };
  const emit = { id: 'emit', kind: 'EMIT', reference: 'effect', dependsOn: ['check'] };
  const input = { operations: [check, emit], policy: { check: ['verifier'], emit: ['effect'] }, allowEmit: true };
  runtime.registerVerifier('verifier', () => ({ valid: true, status: 'refuted' }));
  assert.equal((await runtime.execute(input)).reason, 'verification_failed');
  runtime.registerVerifier('verifier', () => ({ valid: true }));
  assert.equal((await runtime.execute({ ...input, operations: [check, { ...emit, input: 'unchecked' }] })).reason,
    'emit_requires_verified_receipt');
  assert.equal(emitted, 0);
  assert.equal((await runtime.execute(input)).status, 'emitted');
  assert.equal(emitted, 1);
  assert.deepEqual(economy.shapeOperations([check, emit], economy.plan({ level: 'L0' })),
    [{ ...check, dependsOn: [] }, emit]);
}

async function explicitProgram() {
  const original = runner.runFallback;
  runner.runFallback = async (_, context) => ({ text: context.prompt, model: 'test://omega' });
  try {
    const result = await router.generate({ model: 'test://omega', prompt: 'task',
      cognitiveObjects: { source: { number: 41 } },
      cognitiveProgram: [{ id: 'read', kind: 'READ', reference: 'source' },
        { id: 'call', kind: 'CALL', reference: 'add', dependsOn: ['read'] },
        { id: 'infer', kind: 'INFER', reference: 'model/runtime', dependsOn: ['call'] }],
      cognitiveNativeHandlers: { tools: { add: ({ input }) => ({ answer: input.number + 1 }) } } });
    assert.deepEqual(result.cognitive.execution.operations.map((op) => op.kind), ['READ', 'CALL', 'INFER']);
    assert.match(result.text, /42/);
  } finally { runner.runFallback = original; }
}

async function main() {
  await mmuPermissions();
  await expiryAndIntegrity();
  await proofGates();
  await explicitProgram();
  assert.equal(procedures.contextSimilarity({ domain: 'worker', operation: 'execute' },
    { domain: 'trinity', operation: 'execute' }), 0);
  assert.equal(schema.validate([], { schema: { type: 'array', minItems: 1 } }).valid, false);
  assert.equal(schema.validate('x', { schema: { type: 'string', minLength: 3 } }).valid, false);
  console.log('Omega safety regressions passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
