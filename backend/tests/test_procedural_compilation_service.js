'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const service = require('../src/services/proceduralCompilationService');

(async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
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
    executor: async ({ step, input }) => `${input}:${step}` });
  assert.equal(reused.status, 'reused');
  assert.equal(reused.llmCalls, 0);
  assert.equal(reused.costUsd, 0);
  assert.equal(reused.value, '0:read:select:write');
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
    context: { ...nearbyContext, environment: 'red' }, input: 0,
    executor: async ({ step, input }) => `${input}:${step}` });
  assert.equal(generalized.status, 'reused');
  assert.ok(generalized.contextMatch >= 0.8);
  const crossDomain = await service.reuse(db, { agentId: 'a2', contextHash: 'ctx-green',
    context: { ...nearbyContext, domain: 'worker', environment: 'green' },
    executor: async () => { throw new Error('must not execute across domains'); } });
  assert.equal(crossDomain.status, 'miss');
  console.log('Procedural compilation checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
