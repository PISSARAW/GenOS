'use strict';

const path = require('node:path');
const execution = require('../src/services/strategyExecutionService');
const { withTransaction } = require('../src/db');

async function prepareLocked(input) {
  const { db, context, mission, contractRecord, budget } = input;
  const parent = await currentParent(input);
  if (!context.missionId) throw new Error('Direct worker control requires its real mission identity.');
  const membership = await require('../src/services/missionIdentityService').get(db, context.missionId);
  if (!membership || membership.orchestratorAgentId !== parent.id || membership.status !== 'active') {
    throw Object.assign(new Error('Direct worker control parent is not the active mission owner.'),
      { code: 'DIRECT_WORKER_CONTROL_SCOPE_REQUIRED' });
  }
  const run = await execution.createExecutionRun(db, { agentId: parent.id,
    missionId: context.missionId, budget, contractRecord });
  context.directWorkerParentBudgetRunId = run.id;
  const normalizedMission = { agentId: parent.id, missionId: context.missionId,
    workspaceId: parent.workspace_id, workspaceRoot: parent.workspace_root,
    prompt: context.task, toolLease: [], capabilities: [], timeoutMs: run.budget.latencyMs,
    executionBudget: run.budget, protocolProfile: 'direct-worker-control' };
  const ctx = { db, agentId: parent.id, executionRun: run, contractRecord,
    dispatchedAgent: { ...parent, execution_mode: 'orchestrator' },
    normalizedMission, normalizedExecutionBudget: run.budget, runtimeBudget: run.budget,
    autonomyPlan: {}, executable: path.join(__dirname, 'genos-orchestrate.cjs') };
  if (input.model) await require('../src/services/missionModelBudgetScope').bindParent(ctx);
  await require('../src/services/missionEnvelopeAuthority').seal(ctx);
  await require('../src/services/missionProtocols/runtime').initialize(ctx);
  await require('../src/services/missionProtocols/continuity').beforeExecution(ctx.protocolBinding);
  await execution.recordExecutionEvent(db, parent.id, { id: `direct-worker-control:${run.id}`,
    eventType: 'AGENT_RUNTIME_STARTED', timestamp: new Date().toISOString(),
    detail: 'Native CLI control run dispatches a worker; no parent outcome is asserted.',
    payload: { executionRunId: run.id, childAgentId: mission.agentId, profile: 'direct-worker-control' } });
  return { run, ctx };
}

async function currentParent(input) {
  const held = await input.db.get(`SELECT a.*,w.path AS workspace_root FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=? AND a.execution_mode='orchestrator'`, input.parent.id);
  const authority = require('../src/services/missionEnvelopeAuthority');
  if (!held || held.workspace_id !== input.parent.workspace_id
    || await authority.realWorkspaceRoot(held.workspace_root) !== await authority.realWorkspaceRoot(input.parent.workspace_root)) {
    throw Object.assign(new Error('Direct worker control workspace changed.'), { code: 'DIRECT_WORKER_CONTROL_SCOPE_REQUIRED' });
  }
  return held;
}

const prepare = input => withTransaction(input.db, () => prepareLocked(input));

module.exports = { prepare };
