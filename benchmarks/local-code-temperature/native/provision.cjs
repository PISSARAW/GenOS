'use strict';
const c = require('./common.cjs');
const execution = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/execution.cjs');
async function provision(input) {
  const { directory, task, genome, run } = input;
  const workspace = execution.prepareWorkspace(directory, task);
  const db = await c.backend('src/db').getDatabase();
  await db.run("INSERT INTO organizations(id,name) VALUES('benchmark-org','Temperature experiment')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES('benchmark-project','benchmark-org','Temperature experiment')");
  const scope = { organizationId: 'benchmark-org', projectId: 'benchmark-project' };
  const ws = await c.service('workspaceRegistry').registerWorkspace(db, { workspacePath: workspace, ...scope });
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id,metadata_json)
    VALUES('benchmark-root','Temperature controller','orchestrator','idle','orchestrator',?,'{}')`, ws.id);
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id,metadata_json)
    VALUES('benchmark-worker','LocalCodeWorker','implementation','idle','worker','benchmark-root',?,'{}')`, ws.id);
  const missionId = 'temperature-mission';
  await c.service('missionIdentityService').create(db, { missionId, objective: task.specification,
    orchestratorAgentId: 'benchmark-root' });
  await c.service('missionIdentityService').attachAgent(db, { missionId, agentId: 'benchmark-worker', role: 'implementation' });
  const contractRecord = await c.service('strategyContractService').saveContract(db, {
    agentId: 'benchmark-root', workspaceId: ws.id, problem: 'Repair a pure JavaScript function and test the result',
    requestedPrimary: 'plan_execute_verify', problemProfile: { type: 'implementation', risk: 'low', complexity: 0.2, uncertainty: 0.2 } });
  const plan = c.service('autonomousOrchestrationService').buildAutonomyPlan(contractRecord.contract, { tokens: 8192 });
  c.service('agentRuntimeAdapter/missionPlanning').assertAutonomyPlanExecutable({ autonomyPlan: plan,
    dispatchedAgent: { execution_mode: 'orchestrator' }, normalizedMission: {} });
  const budget = { tokens: 8192, costUsd: 1, latencyMs: 120000, events: 100 };
  const parentRun = await c.service('strategyExecutionService').createExecutionRun(db, {
    agentId: 'benchmark-root', missionId, contractRecord, budget });
  const parentContext = { db, agentId: 'benchmark-root', executionRun: parentRun,
    dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: ws.id },
    normalizedMission: { executionBudget: budget }, normalizedExecutionBudget: budget };
  await c.service('missionModelBudgetScope').bindParent(parentContext);
  await c.service('agentDnaStore').saveGenome(db, genome, { id: 'trial-genome', status: 'active', ...scope });
  c.assert.equal(genome.meta.status, 'DRAFT');
  const prompt = `${task.specification}\nCurrent module.js:\n${task.original}\nReturn a genos.file-replacement/v1 proposal for module.js only, tests ["node check.cjs"]. Use pure JavaScript, CommonJS, no imports or host APIs.`;
  const mission = c.service('orchestratorDispatchService').buildWorkerMission({
    agentId: 'benchmark-worker', orchestratorAgentId: 'benchmark-root', name: 'LocalCodeWorker',
    missionId, role: 'implementation', workerKind: 'bounded_worker', prompt,
    workspaceId: ws.id, workspaceRoot: workspace, workspaceProvisioned: true, localRuntime: true, writeLease: true,
    executor: 'local', localCodeWorker: true, localModel: 'ollama://' + c.CONFIG.model,
    localContextTokens: 8192, executionBudget: budget, timeoutMs: 120000,
    modelBudgetScope: parentContext.normalizedMission.modelBudgetScope,
    workerAssignment: { genomeRef: 'trial-genome', workerKind: 'bounded_worker' }, requiredPatchPaths: ['module.js'],
    capabilities: [], toolLease: [],
    localRoutingPolicy: { primary: 'ollama://' + c.CONFIG.model, fallbacks: [], preferLocal: true },
    executionPolicy: { allowFileEdits: true, explicitWriteLease: true,
      allowedCommands: ['node check.cjs'], allowedWritePaths: ['module.js'],
      inferenceLimits: { attempts: 1, outputTokens: 1536 } } });
  Object.assign(mission, { forceFullFileReplacement: true, identityExperimentSeed: run.seed,
    allowedPatchPaths: ['module.js'], useMemoryContext: false });
  await db.run(`INSERT INTO provider_configs(provider,model,endpoint,enabled,cost_input,cost_output)
    VALUES('ollama',?,'http://127.0.0.1:11434/api/chat',1,0,0)`, c.CONFIG.model);
  return { db, mission, plan, workspace };
}
module.exports = { provision };
