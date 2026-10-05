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
  console.log('Procedural compilation checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
