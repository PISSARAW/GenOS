'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

async function create() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ateam-rpe-native-'));
  const environment = configure(root);
  const database = require('../../src/db');
  const db = await database.getDatabase(process.env.GENOS_DB_PATH);
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace); fs.writeFileSync(path.join(workspace, 'task.txt'), 'Compute a real bounded subset-sum witness.');
  const native = require('./workerCooperationRuntime.cjs');
  const context = await native.seed(db, { id: 'ateam-rpe-root', workspace, maxStages: 1 });
  const source = await native.execute(context, { expectedKind: 'bounded_worker', objective: {
    goal: 'Compute a bounded subset sum and return a witness accepted by two independent native oracles.',
    methodContract: require('./nativeWorkerFixtures').scoped,
    successCriteria: ['Persist a result accepted by two independent native oracles.'] } });
  await require('../../src/services/missionEnvelopeAuthority').assertCompletedRunEvidence(db,
    { agentId: source.workerId, runId: source.runId });
  return { ...context, root, db, source, environment, close: () => close({ db, root, environment }) };
}
function configure(root) {
  const values = { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_DB_PATH: path.join(root, 'qualification.sqlite'), GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'), GENOS_SNAPSHOT_ROOT: path.join(root, 'snapshots'),
    GENOS_WORKSPACES_ROOT: root, GENOS_DISABLE_WORKSPACE_GC: '1' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  return previous;
}
async function close(input) {
  await require('../../src/services/garageRuntimeService').stop(input.db);
  await require('./flushTelemetrySideEffects').flushTelemetrySideEffects();
  await require('../../src/db').closeDatabase();
  const resolved = path.resolve(input.root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('genos-ateam-rpe-native-'));
  fs.rmSync(resolved, { recursive: true, force: true });
  for (const [key, value] of Object.entries(input.environment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
async function consumer(context, label) {
  const assignment = { workerKind: 'bounded_worker', role: 'bounded_worker', label,
    hypothesis: 'Inspect the exact incoming delivery before accepting its use.', capabilities: [] };
  const created = await require('../../src/services/agentFleetWorkers').createAutonomousWorkers(context.db,
    { id: context.id, agent_type: 'GenOS' }, { plan: {
      strategyContract: { primary: 'tree-search' }, dispatchWorkers: [assignment],
      tokenPolicy: { total: 1000, workerShare: 1, orchestratorReserve: 0,
        rounds: { initial: { perWorkerTokens: 1000 } } } },
    mission: { missionId: context.id, prompt: assignment.hypothesis, workspaceRoot: context.workspace,
      workspaceProvisioned: true, executionBudget: { tokens: 1000, costUsd: 0.1, latencyMs: 180000 },
      executionPolicy: { allowFileEdits: false }, timeoutMs: 180000, executor: 'local' } });
  const worker = created[0];
  await require('../../src/services/missionIdentityService').attachAgent(context.db,
    { missionId: context.id, agentId: worker.agentId, role: 'bounded_worker' });
  return worker;
}
function member(workerId, domain, dependencies) {
  return { memberId: domain, workerId, agentId: workerId, role: 'bounded_worker', workerKind: 'bounded_worker',
    domain, subSystem: domain, dependsOn: dependencies, mission: 'Consume checked native evidence.',
    executionBudgetTokens: 1000, status: 'ACTIVE' };
}
async function team(context, label) {
  const target = await consumer(context, label);
  const formed = await require('../../src/services/aTeam/aTeamRuntime').createRun({ db: context.db,
    missionId: context.id, idempotencyKey: label, goal: 'Native source evidence to a scoped consumer.',
    relationalPolicy: { version: 1, required: true }, status: 'RUNNING', phase: 'EXECUTION',
    execution: { runtimeMissionId: context.id, deadlineAt: new Date(Date.now() + 600000).toISOString() },
    members: [member(context.source.workerId, 'source', []), member(target.agentId, 'target', ['source'])] });
  const claimed = await require('../../src/services/aTeam/aTeamRuntime').claimExecution({ db: context.db,
    teamRunId: formed.run.teamRunId, ownerId: context.id });
  const observed = await require('../../src/services/aTeam/execution/workGraphExecutionService').observeExecution({
    db: context.db, run: claimed.run, plan: { members: claimed.run.members }, expired: false });
  const edge = observed.graph.edges[0];
  assert.equal(edge.available, true, JSON.stringify(edge));
  assert.equal(edge.accepted, false);
  return { run: claimed.run, runnerToken: claimed.token, target, handoff: edge.handoff,
    graph: observed.graph, member: claimed.run.members.find(m => m.workerId === target.agentId) };
}
async function receive(context, test, handoffs) {
  const row = await context.db.get('SELECT metadata_json,workspace_id FROM agents WHERE id=?', test.target.agentId);
  const metadata = JSON.parse(row.metadata_json);
  const workspace = await context.db.get('SELECT path FROM workspaces WHERE id=?', row.workspace_id);
  const mission = { agentId: test.target.agentId, orchestratorAgentId: context.id,
    missionId: context.id, workspaceId: row.workspace_id, workspaceRoot: workspace.path,
    workerKind: 'bounded_worker', workerContract: metadata.workerContract, role: 'bounded_worker',
    handoffContext: handoffs, prompt: 'Inspect the incoming handoff without inventing a semantic acknowledgment.',
    toolLease: [], executionBudget: { tokens: 1000, costUsd: 0.1, latencyMs: 180000 }, timeoutMs: 180000 };
  const contractRecord = await require('../../src/services/strategyContractService').getLatestContract(context.db, context.id);
  const executionRun = await require('../../src/services/strategyExecutionService').createExecutionRun(context.db, {
    agentId: mission.agentId, missionId: context.id, contractRecord, budget: mission.executionBudget });
  await require('../../src/services/missionEnvelopeAuthority').seal({ db: context.db,
    agentId: mission.agentId, normalizedMission: mission, executionRun, contractRecord, executable: process.execPath });
  return { mission, executionRun };
}

module.exports = { create, close, team, receive };
