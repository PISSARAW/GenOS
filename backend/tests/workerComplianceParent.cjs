'use strict';

const path = require('node:path');
const identity = require('../src/services/missionIdentityService');
const execution = require('../src/services/strategyExecutionService');
const contracts = require('../src/services/strategyContractService');

async function parentIdentity(input) {
  const parent = await input.db.get(`SELECT a.*,w.path AS workspace_root FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=? AND a.execution_mode='orchestrator'`, input.parentId);
  const authority = require('../src/services/missionEnvelopeAuthority');
  if (!parent || parent.workspace_id !== input.workspaceId ||
    await authority.realWorkspaceRoot(parent.workspace_root) !== await authority.realWorkspaceRoot(input.rootWorkspace)) {
    throw new Error('Compliance control workspace changed.');
  }
  return parent;
}

async function prepare(input) {
  const { db, parentId, workspaceId, rootWorkspace, missionId, kind } = input;
  await identity.create(db, { missionId, objective: `Compliance mission for ${kind}`, orchestratorAgentId: parentId });
  const parent = await parentIdentity(input);
  const contractRecord = await contracts.getLatestContract(db, parentId, workspaceId);
  const timeoutMs = Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000;
  const code = require('./boundedCodeWorkerQualification.cjs').enabled(kind);
  const budget = { tokens: 5000, events: 40, latencyMs: timeoutMs, ...(code ? { costUsd: 0.2 } : {}) };
  const authority = await require('../src/services/missionExecutionAuthority').rotate(db, { missionId, agentId: parentId });
  const run = await execution.createExecutionRun(db, { agentId: parentId, missionId, contractRecord, budget });
  const normalizedMission = { agentId: parentId, missionId, workspaceId, workspaceRoot: rootWorkspace,
    prompt: `Dispatch the isolated ${kind} compliance worker.`, timeoutMs, executionBudget: run.budget,
    toolLease: [], capabilities: [], missionExecutionAuthority: authority, protocolProfile: 'worker-compliance-control' };
  const ctx = { db, agentId: parentId, executionRun: run, contractRecord, normalizedMission,
    dispatchedAgent: parent, runtimeBudget: run.budget, normalizedExecutionBudget: run.budget, autonomyPlan: {},
    executable: path.join(__dirname, 'run_worker_compliance_missions.cjs') };
  if (code) await require('./boundedCodeWorkerQualification.cjs').bindModelBudget({ ...input, parentContext: ctx });
  await require('../src/services/missionEnvelopeAuthority').seal(ctx);
  await require('../src/services/missionProtocols/runtime').initialize(ctx);
  await require('../src/services/missionProtocols/runtime').beforeExecution(ctx);
  return { run, ctx, modelBudgetScope: normalizedMission.modelBudgetScope || null };
}

async function dispatch(input) {
  const { db, parentId, missionId, kind, worker, parentControl } = input;
  await identity.attachAgent(db, { missionId, agentId: worker.agentId, role: kind });
  await require('../src/services/missionEnvelopeAuthority').assertRun(db, {
    agentId: parentId, runId: parentControl.run.id, mission: parentControl.ctx.normalizedMission });
  await execution.recordExecutionEvent(db, parentId, { id: `compliance-dispatch:${parentControl.run.id}`,
    eventType: 'AGENT_RUNTIME_STARTED', timestamp: new Date().toISOString(),
    detail: 'Native compliance controller dispatches its worker; no parent completion is claimed.',
    payload: { executionRunId: parentControl.run.id, childAgentId: worker.agentId, profile: 'worker-compliance-control' } });
}

module.exports = { prepare, dispatch };
