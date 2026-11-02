'use strict';

const runtime = require('./runtime');
const budget = require('./windowsBudget');
const HARNESS = Symbol('explicit-windows-test-harness');

const persistent = db => ['get', 'all', 'run', 'exec'].every(name => typeof db?.[name] === 'function');

function harness(input, options) {
  if (options.testHarness !== true) throw new Error('WINDOWS_PROTOCOL_PERSISTENT_DATABASE_REQUIRED');
  if (persistent(input.db)) throw new Error('WINDOWS_PROTOCOL_HARNESS_FORBIDDEN_ON_DATABASE');
  const mission = input.mission;
  mission.modelBudgetScope = { id: `test-harness:${mission.agentId}`, tokens: input.budget.tokens, costUsd: input.budget.costUsd };
  return { [HARNESS]: true, db: input.db, agentId: mission.agentId, normalizedMission: mission,
    executionRun: { id: `test-harness:${mission.agentId}`, budget: input.budget } };
}

async function context(input) {
  const { db, mission } = input;
  budget.validate(input.budget);
  const agent = await db.get('SELECT * FROM agents WHERE id=?', mission.agentId);
  if (!agent?.workspace_id) throw new Error('WINDOWS_PROTOCOL_AGENT_WORKSPACE_REQUIRED');
  const workspace = await db.get('SELECT path FROM workspaces WHERE id=?', agent.workspace_id);
  if (!workspace?.path) throw new Error('WINDOWS_PROTOCOL_REGISTERED_WORKSPACE_REQUIRED');
  const identity = require('../trinityWorkspaceIdentity');
  const roots = await Promise.all([workspace.path, mission.workspaceRoot].map(root => identity.canonicalWorkspaceRootAsync(root)));
  if (!identity.sameWorkspaceRoot(...roots)) throw new Error('WINDOWS_PROTOCOL_WORKSPACE_ROOT_MISMATCH');
  mission.workspaceRoot = roots[0];
  const contract = await require('../strategyContractService').getLatestContract(db, mission.agentId);
  if (!contract) throw new Error('WINDOWS_PROTOCOL_CONTRACT_REQUIRED');
  const run = await require('../strategyExecutionService').createExecutionRun(db, { agentId: mission.agentId,
    missionId: mission.missionId, contractRecord: contract, budget: { ...input.budget, deterministic: false } });
  mission.workspaceId = agent.workspace_id;
  mission.executionBudget = { ...input.budget };
  mission.toolLease = mission.toolLease || [];
  mission.evidencePolicy = mission.evidencePolicy || { independentVerifier: true };
  const maximum = input.budget.tokens;
  mission.requestTokenBudget = Math.min(mission.requestTokenBudget ?? maximum, maximum);
  mission.workerTokenLimit = Math.min(mission.workerTokenLimit ?? maximum, maximum);
  return { db, agentId: mission.agentId, normalizedMission: mission, dispatchedAgent: agent, contractRecord: contract,
    executionRun: run, normalizedExecutionBudget: input.budget, runtimeBudget: run.budget,
    autonomyPlan: { ...input.autonomyPlan, mode: 'windows_local' },
    authorityExecutable: require.resolve('../workerEvidenceBarrierLocal') };
}

async function failed(ctx, error) {
  await ctx.db.run(`UPDATE strategy_execution_runs SET status='failed',guardrail_reason=?,completed_at=CURRENT_TIMESTAMP
    WHERE id=? AND status IN ('planned','running')`, error.code || error.message, ctx.executionRun.id);
}

async function prepare(input, options = {}) {
  if (!persistent(input.db) || options.testHarness === true) return harness(input, options);
  const databases = await input.db.all('PRAGMA database_list');
  if (!databases.find(row => row.name === 'main')?.file) throw new Error('WINDOWS_PROTOCOL_DURABLE_DATABASE_REQUIRED');
  const ctx = await context(input);
  try {
    await budget.bind(ctx, input.parentScope);
    if (!input.coordinatorOnly) await require('../gqwf/missionExecution').prepareMissionWorkspace(ctx);
    await require('./synapse').prepare(ctx);
    await require('./allostasis').prepare(ctx);
    await require('../missionEnvelopeAuthority').seal(ctx);
    await runtime.initialize(ctx);
    return ctx;
  } catch (error) { await failed(ctx, error); throw error; }
}

async function execute(ctx, run) {
  if (ctx[HARNESS]) return run();
  return runtime.runInProcess(ctx, async () => {
    try {
      await runtime.beforeExecution(ctx);
      await require('../missionEnvelopeAuthority').assertRun(ctx.db, { agentId: ctx.agentId,
        runId: ctx.executionRun.id, mission: ctx.normalizedMission, verifyInputs: true, executable: ctx.authorityExecutable });
      await ctx.db.run("UPDATE strategy_execution_runs SET status='running',started_at=? WHERE id=? AND status='planned'",
        new Date().toISOString(), ctx.executionRun.id);
      const result = await run();
      if (!result?.started || result.unresolved === true) await failed(ctx, new Error('WINDOWS_LOCAL_WORKER_UNRESOLVED'));
      return result;
    } catch (error) { await failed(ctx, error); throw error; }
  });
}

module.exports = { prepare, execute };
