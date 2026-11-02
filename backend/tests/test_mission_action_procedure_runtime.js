'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-procedure-native-tests';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const nativeFixture = require('./helpers/missionActionsFixture');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { SCHEMA, STATUSES } = require('../src/services/missionOutcomeContract');
const compilation = require('../src/services/proceduralCompilationService');
const procedureRuntime = require('../src/services/missionActionProcedureService');
const trust = require('../src/services/missionActionRuntimeTrust');
const modelRouter = require('../src/services/modelRouter');
const { handleAction } = require('../bin/orchestratorActions.cjs');

const KEY = 'procedure-runtime-test-key-0123456789abcdef';
const CONTRACT = { schema: SCHEMA, goal: 'Verify the answer',
  obligations: [{ id: 'answer', statement: 'The answer is correct' }], statuses: [...STATUSES] };
const CONTEXT = { domain: 'mission', operation: 'answer',
  organizationId: 'org', projectId: 'project' };
let activeContext;

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fixture() {
  activeContext = await nativeFixture.create();
  activeContext.db.actionFixture = activeContext;
  return activeContext.db;
}

async function candidate(db, obligationIds = ['answer']) {
  for (let index = 0; index < 3; index++) {
    await compilation.recordTrace(db, { agentId: 'worker', contextHash: 'contract-v1',
      context: CONTEXT, steps: ['read', 'answer'], input: 'question', success: true,
      evidenceRefs: [`evidence:${index}`] });
  }
  return compilation.compile(db, { agentId: 'worker', contextHash: 'contract-v1',
    context: CONTEXT, executorId: 'fixture:answer', obligationIds,
    outcomeContractDigest: digest(CONTRACT) });
}

async function promoted(db, validForMs, obligationIds) {
  return compilation.promote(db, { candidate: await candidate(db, obligationIds), validForMs,
    validator: async () => ({ status: 'verified' }) });
}

function action(procedure) {
  return { id: 'reuse-answer', kind: 'procedure', covers: ['answer'],
    requiredEvidenceRefs: ['evidence:0'],
    cost: { execution: { tokens: 0, usd: 0, latencyMs: 5 },
      verification: { tokens: 0, usd: 0, latencyMs: 5 }, maxRetries: 0 },
    execution: { procedureId: procedure.procedure.procedureId, version: 1,
      contextHash: 'contract-v1', context: CONTEXT,
      contextSignature: compilation.contextSignature(CONTEXT),
      receiptDigest: procedure.receipt?.digest || 'missing', executorId: 'fixture:answer',
      input: 'question' },
    calibrationReceipt: { probabilityVerified: { min: 0.9, max: 0.95 },
      evidenceRefs: ['evidence:0'], issuer: 'fixture',
      validUntil: new Date(Date.now() + 60000).toISOString() } };
}

function signed(candidate) {
  const signature = crypto.createHmac('sha256', KEY).update(trust.attestationPayload({
    runId: activeContext.executionRun.id, missionId: 'worker-mission', contract: CONTRACT, action: candidate
  })).digest('hex');
  candidate.calibrationReceipt.signature = `sha256:${signature}`;
  return candidate;
}

function request(candidate) {
  return { executionRunId: activeContext.executionRun.id, agentId: 'worker', missionId: 'worker-mission',
    decision: { mode: 'active', actions: [signed(candidate)] } };
}

async function invoke(db, candidate) {
  const write = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += String(chunk); return true; };
  try {
    assert.equal(await handleAction({ action: 'execute_mission_action', db,
      request: request(candidate), orchestratorId: 'worker' }), true);
    return JSON.parse(output);
  } finally { process.stdout.write = write; }
}

async function withRuntime(test) {
  const db = await fixture();
  const oldGenerate = modelRouter.generate;
  const oldFlag = process.env.GENOS_MISSION_ACTION_ACTIVE;
  const oldKey = process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
  let modelCalls = 0;
  modelRouter.generate = async () => { modelCalls++; throw new Error('Model must not run.'); };
  procedureRuntime.registerBinding('fixture:answer', {
    execute: async ({ step, input }) => `${input}:${step}`,
    validateResult: async (value) => value === 'question:read:answer' });
  process.env.GENOS_MISSION_ACTION_ACTIVE = '1';
  process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = KEY;
  try { await test(db, () => modelCalls); } finally {
    modelRouter.generate = oldGenerate;
    if (oldFlag === undefined) delete process.env.GENOS_MISSION_ACTION_ACTIVE;
    else process.env.GENOS_MISSION_ACTION_ACTIVE = oldFlag;
    if (oldKey === undefined) delete process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY;
    else process.env.GENOS_MISSION_ACTION_ATTESTATION_KEY = oldKey;
    await db.actionFixture.close();
  }
}

async function testExecution() {
  await withRuntime(async (db, modelCalls) => {
    const promotion = await promoted(db);
    assert.equal(promotion.status, 'promoted');
    const candidate = action(promotion);
    const result = await invoke(db, candidate);
    assert.equal(result.status, 'executed_unverified');
    assert.equal(result.result.value, 'question:read:answer');
    assert.equal(result.result.llmCalls, 0);
    assert.equal(result.result.procedure.receiptDigest, promotion.receipt.digest);
    assert.equal(result.missionVerified, false);
    assert.equal(modelCalls(), 0);
    const row = await db.get(`SELECT action_id, status, tokens, latency_ms
      FROM mission_action_decisions WHERE mode = 'active'`);
    assert.deepEqual(row, { action_id: 'reuse-answer', status: 'executed_unverified',
      tokens: 0, latency_ms: 10 });
    await assert.rejects(invoke(db, action(promotion)), { code: 'MISSION_ACTION_DUPLICATE' });
  });
}

async function testUnpromotedAndStale() {
  await withRuntime(async (db, modelCalls) => {
    const unpromoted = { procedure: (await candidate(db)).procedure };
    const missing = await invoke(db, action(unpromoted));
    assert.equal(missing.status, 'need_evidence');
    assert.equal(missing.decision.alternatives[2].reason, 'procedure_not_promoted');
    const promotion = await promoted(db, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const stale = await invoke(db, action(promotion));
    assert.equal(stale.status, 'need_evidence');
    assert.equal(stale.decision.alternatives[2].reason, 'procedure_promotion_expired');
    assert.equal(modelCalls(), 0);
    assert.equal((await db.all("SELECT id FROM mission_action_decisions WHERE mode = 'active'")).length, 0);
  });
}

async function testBindingAndBudget() {
  await withRuntime(async (db, modelCalls) => {
    const promotion = await promoted(db);
    const wrongReceipt = action(promotion);
    wrongReceipt.execution.receiptDigest = 'stale-digest';
    const rejected = await invoke(db, wrongReceipt);
    assert.equal(rejected.decision.alternatives[2].reason, 'procedure_receipt_unverified');
    await db.run('UPDATE strategy_execution_runs SET metrics_json = ? WHERE id = ?',
      JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 299995 }), activeContext.executionRun.id);
    const overBudget = await invoke(db, action(promotion));
    assert.equal(overBudget.decision.alternatives[2].reason, 'budget_exceeded');
    assert.equal(modelCalls(), 0);
  });
}

async function testUnboundObligation() {
  await withRuntime(async (db, modelCalls) => {
    const promotion = await promoted(db, undefined, []);
    const rejected = await invoke(db, action(promotion));
    assert.equal(rejected.status, 'need_evidence');
    assert.equal(rejected.decision.alternatives[2].reason, 'procedure_receipt_unverified');
    assert.equal(modelCalls(), 0);
    assert.equal((await db.all("SELECT id FROM mission_action_decisions WHERE mode = 'active'")).length, 0);
  });
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-procedure-telemetry-'));
  process.env.GENOS_DB_PATH = path.join(directory, 'telemetry.db');
  await require('../src/db').getDatabase();
  try {
    await testExecution(); await testUnpromotedAndStale(); await testBindingAndBudget(); await testUnboundObligation();
    console.log('Mission procedure runtime tests passed with genuine sealed authority.');
  } finally {
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await require('../src/db').closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
