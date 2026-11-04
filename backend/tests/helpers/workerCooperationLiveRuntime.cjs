'use strict';

const assert = require('node:assert/strict');
const evidence = require('./workerCooperationLiveEvidence.cjs');
const budget = { tokens: 16000, costUsd: 0.25, events: 100, latencyMs: 180000 };

async function dispatch(context, task) {
  evidence.preflight(task);
  await require('../../src/services/missionEnvelopeAuthority').assertRun(context.db, {
    agentId: context.id, runId: context.control.run.id, mission: context.control.ctx.normalizedMission });
  const assignment = { role: task.kind, workerKind: task.kind, label: task.kind, hypothesis: task.prompt,
    capabilities: [], specialtyNiche: 'resource_allocation', workspaceVerificationContract: task.verificationContract,
    methodContract: task.methodContract, recoveryLease: task.recoveryLease };
  const mission = { missionId: context.id, prompt: task.prompt, workspaceRoot: context.workspace,
    workspaceProvisioned: true, executor: 'local', localRuntime: true, localModel: context.model,
    localContextTokens: 16384, timeoutMs: budget.latencyMs, executionBudget: budget,
    modelBudgetScope: context.control.ctx.normalizedMission.modelBudgetScope, readOnlyWorkspaceEvidence: true,
    executionPolicy: { allowFileEdits: false, allowedCommands: [] } };
  const workers = await require('../../src/services/agentFleetWorkers').createAutonomousWorkers(context.db,
    { id: context.id, agent_type: 'GenOS' }, { mission, plan: { strategyContract: { primary: 'tree-search' },
      tokenPolicy: { total: 20000, workerShare: 0.8, orchestratorReserve: 0.2,
        rounds: { initial: { perWorkerTokens: budget.tokens } } }, dispatchWorkers: [assignment] } });
  const worker = workers[0];
  await require('../../src/services/missionIdentityService').attachAgent(context.db,
    { missionId: context.id, agentId: worker.agentId, role: task.kind });
  const stored = await context.db.get('SELECT metadata_json,parent_agent_id FROM agents WHERE id=?', worker.agentId);
  assert.equal(stored.parent_agent_id, context.id);
  const contract = JSON.parse(stored.metadata_json).workerContract;
  assert.deepEqual(contract.assignment.workspaceVerificationContract || null, task.verificationContract || null);
  const stage = { kind: task.kind, workerId: worker.agentId, workspaceRoot: worker.workspaceRoot,
    inputRefs: task.inputRefs || [], authority: contract.authority, verificationContract: task.verificationContract };
  context.report.stages.push(stage);
  await context.save();
  try {
    await require('../../src/services/agentRuntimeAdapter').startMission({ ...mission,
      agentId: worker.agentId, orchestratorAgentId: context.id, workerKind: task.kind, role: task.kind,
      workerContract: contract, workerAssignment: assignment, specialtyNiche: 'resource_allocation',
      methodContract: task.methodContract, recoveryLease: task.recoveryLease, autonomousOrchestration: false,
      workspaceId: worker.workspaceId, workspaceRoot: worker.workspaceRoot, prompt: worker.prompt });
    return await evidence.stageEvidence(context.db, stage);
  } finally { await context.save(); }
}

module.exports = { dispatch };
