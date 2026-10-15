'use strict';

// Chantier A — voie team : scope propagé, CPU dégradé, tokens remontés.
// Test rouge : chaque cas échoue avant correction, passe après.

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');
const scheduler = require('../src/services/aTeamStageScheduler');
const scopes = require('../src/services/missionModelBudgetScope');
const cpuBudgets = require('../src/services/agents/workerRuntimeBudgetService');
const workerProcessCpu = require('../src/services/agents/workerProcessCpu');
const localWorker = require('../src/services/workerEvidenceBarrierLocal');
const router = require('../src/services/modelRouter');
const runner = require('../src/services/modelRouteRunner');
const provider = require('../src/services/modelProvider');
const dispatchService = require('../src/services/orchestratorDispatchService');

const TEAM_SCOPE = { id: 'execution-run:team-parent-run', costUsd: 0.01,
  tokens: 100000, organizationId: 'org', projectId: 'project' };

function teamPlan() {
  return scheduler.stagePlanFor({ orchestratorId: 'orch-team', planId: 'team-run-1',
    members: [
      { subSystem: 'frontend', role: 'frontend_specialist', mission: 'build ui',
        dependsOn: [], pipelineStage: 0 },
      { subSystem: 'backend', role: 'backend_specialist', mission: 'build api',
        dependsOn: [], pipelineStage: 0 },
      { subSystem: 'integration', role: 'integration_specialist', mission: 'wire up',
        dependsOn: ['frontend', 'backend'], pipelineStage: 1 }
    ] });
}

async function scopeDatabase() {
  const db = openDatabase();
  await db.exec(`${TABLES_MODEL_ATTEMPTS}
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE provider_configs (provider TEXT, model TEXT, endpoint TEXT,
      capabilities_json TEXT, cost_input REAL, cost_output REAL,
      latency_ms INTEGER, enabled INTEGER);
    CREATE TABLE usage_ledger (id TEXT PRIMARY KEY, organization_id TEXT,
      project_id TEXT, release_id TEXT, category TEXT, quantity REAL,
      cost_usd REAL, metadata_json TEXT);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', 'ws-team', 'org', 'project');
  await db.run('INSERT INTO agents VALUES (?, ?)', 'orch-team', 'ws-team');
  await db.run('INSERT INTO provider_configs VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'openai', 'model', 'https://api.example.test/v1', '[]', 1, 1, 0, 1);
  return db;
}

function stubModelCall(inputTokens, outputTokens) {
  const originalRoute = router.generate;
  const originalProvider = provider.generate;
  router.generate = (options) => runner.attemptRoute({ ...options,
    onToken() {}, remainingMs: () => 1000 }, options.model);
  provider.generate = async () => ({ text: '{"claims":[]}', inputTokens,
    outputTokens, tokenUsageMeasured: true });
  return () => { router.generate = originalRoute; provider.generate = originalProvider; };
}

function fakeChild(pid) {
  const handlers = {};
  return { pid, killed: false, exitCode: null, signalCode: null,
    handlers,
    once(event, callback) { (handlers[event] = handlers[event] || []).push(callback); },
    close() { (handlers.close || []).forEach((callback) => callback()); } };
}

function cpuContext(child, maxCpuMs) {
  const halts = [];
  const warnings = [];
  return { child, agentId: 'worker-cpu',
    normalizedMission: { workerContract: { resources: { maxCpuMs } } },
    halts, warnings,
    haltRuntime: (...args) => {
      const [, kind, reason, detail, payload] = args;
      halts.push({ kind, reason, detail, payload });
      child.killed = true;
    },
    emitTracked: (...args) => {
      const [eventType, action, detail, payload, severity, status] = args;
      warnings.push({ eventType, action, detail, payload, severity, status });
    } };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testScopePropagatedToMemberPayload() {
  const plan = teamPlan();
  const request = { execution_budget: { tokens: 5000, costUsd: 0.01 },
    timeoutMs: 1000, modelBudgetScope: TEAM_SCOPE };
  for (const member of plan.members) {
    const payload = scheduler.workerLaunchPayload({ plan, member,
      parentWorkspaceRoot: 'C:/ws', request });
    assert.deepEqual(payload.modelBudgetScope, TEAM_SCOPE);
  }
  const override = { ...TEAM_SCOPE, id: 'execution-run:member' };
  const memberPayload = scheduler.workerLaunchPayload({ plan, member: plan.members[0],
    parentWorkspaceRoot: 'C:/ws',
    request: { ...request, modelBudgetScope: TEAM_SCOPE } });
  assert.deepEqual(memberPayload.modelBudgetScope, TEAM_SCOPE);
  const snake = scheduler.workerLaunchPayload({ plan, member: plan.members[0],
    parentWorkspaceRoot: 'C:/ws', request: { model_budget_scope: override } });
  assert.deepEqual(snake.modelBudgetScope, override);
}

async function testBindTeamScopePersistsParentScope() {
  assert.equal(typeof scopes.bindTeamScope, 'function');
  const db = await scopeDatabase();
  try {
    const scope = await scopes.bindTeamScope({ db, teamRunId: 'team-run-1',
      orchestratorAgentId: 'orch-team',
      budget: { costUsd: 0.01, tokens: 100000 } });
    assert.deepEqual(Object.keys(scope).sort(),
      ['costUsd', 'id', 'organizationId', 'projectId', 'tokens']);
    assert.equal(scope.organizationId, 'org');
    assert.equal(scope.projectId, 'project');
    const row = await db.get(
      'SELECT * FROM mission_model_budget_scopes WHERE scope_id = ?', scope.id);
    assert.equal(row.parent_run_id, 'team-run-1');
    assert.equal(row.parent_agent_id, 'orch-team');
    const routed = await scopes.routeBudget({ agentId: 'worker-0',
      orchestratorAgentId: 'orch-team', modelBudgetScope: scope,
      executionBudget: { costUsd: 0.001 } }, db);
    assert.equal(routed.organizationId, 'org');
    assert.equal(routed.budgetReservationId, scope.id);
  } finally { await db.close(); }
}

async function testTeamMemberRoutesWithoutHalt() {
  const db = await scopeDatabase();
  const restore = stubModelCall(3, 2);
  try {
    const scope = await scopes.bindTeamScope({ db, teamRunId: 'team-run-1',
      orchestratorAgentId: 'orch-team',
      budget: { costUsd: 0.01, tokens: 100000 } });
    const plan = teamPlan();
    const payload = scheduler.workerLaunchPayload({ plan, member: plan.members[0],
      parentWorkspaceRoot: 'C:/ws',
      request: { execution_budget: { tokens: 5000, costUsd: 0.01 },
        timeoutMs: 1000, modelBudgetScope: scope } });
    const mission = dispatchService.buildWorkerMission({
      agentId: payload.workerId, prompt: payload.mission, role: 'implementation',
      orchestratorAgentId: payload.orchestratorId,
      modelBudgetScope: payload.modelBudgetScope,
      executionBudget: { tokens: 5000, costUsd: 0.005 } });
    const result = await localWorker.generateWorkerResult({ db, mission,
      executionRun: { id: 'worker-run-1' }, identitySession: null,
      workerModel: 'openai://model', latencyMs: 1000, maxTokens: 64,
      maxCost: 0.005, policy: { primary: 'openai://model' },
      stageTimings: {}, promptText: 'wire up' });
    assert.ok(result.text);
    const usage = await db.get(
      "SELECT SUM(quantity) AS tokens FROM usage_ledger WHERE category = 'model_inference'");
    assert.equal(usage.tokens, 5);
  } finally { restore(); await db.close(); }
}

async function testTeamMemberWithoutScopeHalts() {
  const db = await scopeDatabase();
  try {
    await assert.rejects(scopes.routeBudget(
      { agentId: 'worker-0', orchestratorAgentId: 'orch-team',
        executionBudget: { costUsd: 0.001 } }, db),
    (error) => error.code === 'MISSION_MODEL_BUDGET_SCOPE_INVALID'
      && /parent model budget scope/.test(error.message));
  } finally { await db.close(); }
}

async function testCpuAccountingFailureHalts() {
  const original = workerProcessCpu.processCpuMs;
  workerProcessCpu.processCpuMs = async () => { throw new Error('probe boom'); };
  const child = fakeChild(process.pid);
  const context = cpuContext(child, 5000);
  try {
    cpuBudgets.startWorkerCpuBudget(context);
    await sleep(400);
    assert.equal(context.halts.length, 1);
    assert.equal(context.halts[0].reason, 'worker_cpu_accounting_unavailable');
  } finally { child.close(); workerProcessCpu.processCpuMs = original; }
}

async function testMeasuredCpuExceedanceStillHalts() {
  const original = workerProcessCpu.processCpuMs;
  let calls = 0;
  workerProcessCpu.processCpuMs = async () => { calls += 1; return calls < 2 ? 0 : 500; };
  const child = fakeChild(process.pid);
  const context = cpuContext(child, 10);
  try {
    cpuBudgets.startWorkerCpuBudget(context);
    await sleep(500);
    assert.equal(context.halts.length, 1);
    assert.equal(context.halts[0].reason, 'worker_cpu_budget_exceeded');
    assert.ok(context.halts[0].payload.observedCpuMs >= 10);
  } finally { child.close(); workerProcessCpu.processCpuMs = original; }
}

async function testInvalidCpuLimitHalts() {
  const child = fakeChild(process.pid);
  const context = cpuContext(child, Number.NaN);
  cpuBudgets.startWorkerCpuBudget(context);
  assert.equal(context.halts.length, 1);
  assert.equal(context.halts[0].reason, 'worker_cpu_budget_invalid');
  child.close();
}

async function testLocalGenerationRequiresExecutionRun() {
  await assert.rejects(localWorker.generateWorkerResult({ mission: { agentId: 'worker' } }),
    (error) => error.code === 'WORKER_EXECUTION_RUN_REQUIRED');
}

(async () => {
  await testScopePropagatedToMemberPayload();
  await testBindTeamScopePersistsParentScope();
  await testTeamMemberRoutesWithoutHalt();
  await testTeamMemberWithoutScopeHalts();
  await testCpuAccountingFailureHalts();
  await testMeasuredCpuExceedanceStillHalts();
  await testInvalidCpuLimitHalts();
  await testLocalGenerationRequiresExecutionRun();
  console.log('Team budget scope, fail-closed CPU accounting and usage ledger checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
