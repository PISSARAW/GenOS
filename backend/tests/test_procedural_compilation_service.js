'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const service = require('../src/services/proceduralCompilationService');
const router = require('../src/services/modelRouter');
const runner = require('../src/services/modelRouteRunner');

const trust = { validateReceipt: async () => true, validateResult: async () => true };

(async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE organism_model_turns (
    id TEXT PRIMARY KEY, agent_id TEXT, session_id TEXT, organization_id TEXT, project_id TEXT,
    status TEXT, request_json TEXT, request_hash TEXT, response_json TEXT, response_hash TEXT,
    completed_at TEXT, error_code TEXT);`);
  for (let i = 0; i < 3; i++) await service.recordTrace(db, { agentId: 'a1', contextHash: 'ctx',
    steps: ['read', 'select', 'write'], input: { i }, success: true, evidenceRefs: [`receipt:${i}`] });
  const candidate = await service.compile(db, { agentId: 'a1', contextHash: 'ctx' });
  assert.equal(candidate.status, 'candidate');
  const contradicted = await service.promote(db, { candidate,
    validator: async () => ({ valid: true, status: 'refuted' }) });
  assert.equal(contradicted.status, 'blocked');
  const promoted = await service.promote(db, { candidate,
    validator: async (procedure, traces) => ({ status: 'verified', procedureId: procedure.procedureId,
      replayed: traces.length }) });
  assert.equal(promoted.status, 'promoted');
  const automatic = await service.compileAndPromote(db, { agentId: 'a1', contextHash: 'ctx',
    autoPromote: true, validator: async () => ({ status: 'verified' }), executorId: 'test' });
  assert.equal(automatic.status, 'promoted');
  const reused = await service.reuse(db, { agentId: 'a1', contextHash: 'ctx', input: 0,
    executor: async ({ step, input }) => `${input}:${step}`, ...trust });
  assert.equal(reused.status, 'blocked');
  assert.equal(reused.reason, 'procedure_input_not_validated');
  const matching = await service.reuse(db, { agentId: 'a1', contextHash: 'ctx', input: { i: 0 },
    executor: async ({ step, input }) => `${input}:${step}`, ...trust });
  assert.equal(matching.status, 'reused');
  assert.equal(matching.llmCalls, 0);
  assert.equal(matching.costUsd, 0);
  assert.equal(matching.value, '[object Object]:read:select:write');
  const miss = await service.reuse(db, { agentId: 'a1', contextHash: 'unknown', input: 0 });
  assert.equal(miss.status, 'miss');
  const nearbyContext = { domain: 'trinity', operation: 'experiment', environment: 'blue' };
  for (let i = 0; i < 3; i++) await service.recordTrace(db, { agentId: 'a2', contextHash: 'ctx-blue',
    context: nearbyContext, steps: ['read', 'select', 'write'], input: { i }, success: true,
    evidenceRefs: [`nearby-receipt:${i}`] });
  const nearby = await service.compile(db, { agentId: 'a2', contextHash: 'ctx-green',
    context: { ...nearbyContext, environment: 'green' }, contextSimilarityThreshold: 0.8 });
  assert.equal(nearby.status, 'candidate');
  assert.equal(nearby.traces.length, 3);
  assert.ok(nearby.procedure.provenance.contextSimilarity >= 0.8);
  await service.promote(db, { candidate: nearby,
    validator: async () => ({ status: 'verified', generalized: true }) });
  const generalized = await service.reuse(db, { agentId: 'a2', contextHash: 'ctx-red',
    context: { ...nearbyContext, environment: 'red' }, input: { i: 0 },
    executor: async ({ step, input }) => `${input}:${step}`, ...trust });
  assert.equal(generalized.status, 'reused');
  assert.ok(generalized.contextMatch >= 0.8);
  const crossDomain = await service.reuse(db, { agentId: 'a2', contextHash: 'ctx-green',
    context: { ...nearbyContext, domain: 'worker', environment: 'green' },
    executor: async () => { throw new Error('must not execute across domains'); } });
  assert.equal(crossDomain.status, 'miss');
  const alteredContext = await service.reuse(db, { agentId: 'a2', contextHash: 'ctx-green',
    context: { ...nearbyContext, domain: 'worker' }, input: { i: 0 }, ...trust });
  assert.equal(alteredContext.status, 'miss');
  const untrusted = await service.reuse(db, { agentId: 'a1', contextHash: 'ctx', input: { i: 0 },
    executor: async () => { throw new Error('must not execute'); }, validateResult: async () => true });
  assert.equal(untrusted.reason, 'procedure_receipt_unverified');
  const invalidOutput = await service.reuse(db, { agentId: 'a1', contextHash: 'ctx', input: { i: 0 },
    executor: async () => 'wrong', validateReceipt: async () => true,
    validateResult: async () => false });
  assert.equal(invalidOutput.status, 'execution_failed');
  await db.run("UPDATE procedural_compiled_procedures SET receipt_json = '{}' WHERE agent_id = 'a1'");
  const tampered = await service.reuse(db, { agentId: 'a1', contextHash: 'ctx',
    input: { i: 0 }, ...trust });
  assert.equal(tampered.reason, 'procedure_receipt_mismatch');
  await service.promote(db, { candidate, validForMs: 1,
    validator: async () => ({ status: 'verified' }) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const expired = await service.reuse(db, { agentId: 'a1', contextHash: 'ctx',
    input: { i: 0 }, ...trust });
  assert.equal(expired.reason, 'procedure_promotion_expired');
  const options = { db, agentId: 'router', prompt: 'task', cognitiveContract: {
    status: 'ready', digest: 'route-ctx', prompt: 'task', economy: {} },
    cognitiveProcedureExecutor: async ({ step, input }) => `${input}:${step}`,
    cognitiveProcedureReceiptValidator: async () => true,
    cognitiveProcedureResultValidator: async () => true };
  const context = service.contextFor(options, options.cognitiveContract);
  for (let i = 0; i < 3; i++) await service.recordTrace(db, { agentId: 'router',
    contextHash: 'route-ctx', context, input: 'task', steps: ['read', 'write'],
    success: true, evidenceRefs: [`route:${i}`] });
  await service.compileAndPromote(db, { agentId: 'router', contextHash: 'route-ctx', context,
    autoPromote: true, validator: async () => ({ status: 'verified' }) });
  const routed = await router.generate(options);
  assert.equal(routed.provider, 'procedural');
  assert.equal(routed.inputTokens, 0);
  assert.equal(routed.cognitive.procedural.status, 'reused');
  await assert.rejects(router.generate({ ...options,
    cognitiveProcedureResultValidator: async () => { throw new Error('validator unavailable'); } }),
  { code: 'PROCEDURAL_EXECUTION_FAILED' });
  const originalFallback = runner.runFallback;
  runner.runFallback = async () => ({ text: 'model fallback', model: 'test://fixture' });
  try {
    const fallback = await router.generate({ ...options, prompt: 'different',
      cognitiveContract: { ...options.cognitiveContract, digest: 'other', prompt: 'different' },
      policy: { primary: 'test://fixture' } });
    assert.equal(fallback.text, 'model fallback');
    assert.equal(fallback.cognitive.procedural.status, 'blocked');
    assert.equal(fallback.cognitive.procedural.reason, 'procedure_input_not_validated');
  } finally { runner.runFallback = originalFallback; }
  console.log('Procedural compilation checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
