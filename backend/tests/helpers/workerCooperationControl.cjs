'use strict';

const assert = require('node:assert/strict');
const authority = require('../../src/services/missionEnvelopeAuthority');

async function prepare(db, input) {
  const parent = await db.get(`SELECT a.*,w.path AS workspace_root FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.id);
  const mission = await require('../../src/services/missionIdentityService').get(db, input.id);
  assert.equal(parent.execution_mode, 'orchestrator');
  assert.equal(mission.orchestratorAgentId, input.id);
  assert.equal(await authority.realWorkspaceRoot(parent.workspace_root), await authority.realWorkspaceRoot(input.workspace));
  const contractRecord = await require('../../src/services/strategyContractService').getLatestContract(db, input.id, parent.workspace_id);
  const lease = await require('../../src/services/missionExecutionAuthority').rotate(db, { missionId: input.id, agentId: input.id });
  const execution = require('../../src/services/strategyExecutionService');
  const run = await execution.createExecutionRun(db, { agentId: input.id, missionId: input.id,
    contractRecord, budget: input.budget });
  const ctx = { db, agentId: input.id, executionRun: run, contractRecord, dispatchedAgent: parent,
    runtimeBudget: run.budget, normalizedExecutionBudget: run.budget, autonomyPlan: {}, executable: process.argv[1],
    normalizedMission: { agentId: input.id, missionId: input.id, workspaceId: parent.workspace_id,
      workspaceRoot: input.workspace, prompt: mission.objective, executionBudget: run.budget,
      timeoutMs: run.budget.latencyMs, toolLease: [], capabilities: [], missionExecutionAuthority: lease } };
  await authority.seal(ctx);
  await require('../../src/services/missionProtocols/runtime').initialize(ctx);
  await require('../../src/services/missionProtocols/runtime').beforeExecution(ctx);
  await execution.recordExecutionEvent(db, input.id, { id: `cooperation-controller:${run.id}`,
    eventType: 'AGENT_RUNTIME_STARTED', timestamp: new Date().toISOString(),
    detail: 'Native qualification controller dispatches isolated workers; no controller verdict is asserted.',
    payload: { executionRunId: run.id, profile: 'worker-cooperation-control' } });
  return { run, ctx };
}

module.exports = { prepare };
