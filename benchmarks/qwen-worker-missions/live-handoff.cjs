'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] || '');
const model = process.argv[3] || 'ollama://qwen2.5:14b';
const git = args => spawnSync('git', args, { cwd: source, encoding: 'utf8', windowsHide: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));

function prepare() {
  if (String(process.env.GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker') throw Object.assign(new Error('Delegated workers cannot run this operator protocol.'), { code: 'GENOS_WORKER_RECURSION_BLOCKED' });
  if (!/^D:\\/i.test(output) || fs.existsSync(output)) throw new Error('Supply a new absolute D: directory.');
  if (!/^ollama:\/\/qwen[A-Za-z0-9_.:/-]+$/.test(model)) throw new Error('Use an explicit local Qwen model.');
  if (git(['status', '--porcelain']).stdout.trim()) throw new Error('Use a clean committed source.');
  if (process.env.NODE_ENV === 'test') throw new Error('This live experiment must not use the test environment.');
  fs.mkdirSync(output, { recursive: true });
  const workspace = path.join(output, 'workspace'); fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'facts.json'), JSON.stringify({ values: [2, 3, 5] }));
  Object.assign(process.env, { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(output, 'protocol.sqlite'), GENOS_WORKSPACE_ROOT: workspace,
    GENOS_STUDIO_ROOT: path.join(output, 'studio'), GENOS_CAPSULE_ROOT: path.join(output, 'capsules'),
    GENOS_RUNNER_LOG_DIR: path.join(output, 'logs'), GENOS_OLLAMA_ENDPOINT: 'http://127.0.0.1:11435/api/chat' });
  for (const key of ['GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_WORKSPACES_ROOT']) delete process.env[key];
  const config = { revision: git(['rev-parse', 'HEAD']).stdout.trim(), model, workspace,
    parentTokens: 24000, workerTokens: 9000, contextTokens: 16384, started: new Date().toISOString(),
    stoppingRule: 'One producer and one recipient; do not retry until success.',
    scope: 'Fresh active mission, real Qwen and transport admission only; outside base campaign scores.' };
  write('experiment.json', config); return config;
}

async function sourceWorker(db, input) {
  const services = '../../backend/src/services/';
  const record = await require(`${services}strategyContractService`).getLatestContract(db, input.parentId);
  const mission = { prompt: 'Prepare a sourced handoff from producers to reviewers. Read facts.json and report the count and sum of its values. Cite the provided evidence references. State the actual parent-dossier delivery and acknowledgment status; do not claim tests or recipient delivery.',
    missionId: input.missionId, orchestratorAgentId: input.parentId, workspaceRoot: input.config.workspace,
    executor: 'local', localRuntime: true, localModel: model, localContextTokens: input.config.contextTokens,
    readOnlyWorkspaceEvidence: true, timeoutMs: 300000, executionPolicy: { allowFileEdits: false },
    executionBudget: { tokens: input.config.workerTokens, costUsd: 1, latencyMs: 300000 } };
  await require('../../backend/bin/directWorkerBudgetScope.cjs').bindDirectWorkerBudget({
    db, context: input.context, parent: await db.get('SELECT * FROM agents WHERE id=?', input.parentId),
    mission, contractRecord: record });
  const [created] = await require(`${services}agentFleetWorkers`).createAutonomousWorkers(db,
    { id: input.parentId, agent_type: 'GenOS' }, { mission, plan: {
      dispatchWorkers: [{ workerKind: 'liaison_worker', role: 'liaison_worker', label: 'live-producer' }],
      strategyContract: { primary: record.contract.selected_strategy.primary },
      tokenPolicy: { total: input.config.workerTokens, workerShare: 1, orchestratorReserve: 0 } } });
  await require(`${services}missionIdentityService`).attachAgent(db, {
    missionId: input.missionId, agentId: created.agentId, role: created.role });
  return { ...mission, agentId: created.agentId, role: created.role, workerKind: created.workerKind,
    workspaceRoot: created.workspaceRoot, workspaceId: created.workspaceId,
    workspaceProvisioned: true, toolLease: created.toolLease || [] };
}

async function execute(db, input) {
  const services = '../../backend/src/services/';
  const relay = require('./relay-11.cjs');
  const runtime = require(`${services}agentRuntimeAdapter`);
  const producerMission = await sourceWorker(db, input);
  write('producer-mission.json', producerMission);
  const producer = await runtime.startMission(producerMission);
  write('producer-result.json', producer);
  const sourceRunId = producer.executionRun.id;
  const status = await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', sourceRunId);
  if (status.status !== 'completed') throw new Error('Producer did not complete; no recipient attempted.');
  const request = { localModel: model, localContextTokens: input.config.contextTokens, workerTokenLimit: input.config.workerTokens };
  const recipientMission = await relay.receiver(db, { sourceRunId, request });
  write('recipient-mission.json', recipientMission);
  const recipient = await runtime.startMission(recipientMission);
  write('recipient-result.json', recipient);
  await require(`${services}telemetryObserver`).flush(10000);
  const rows = await db.all('SELECT payload_json FROM gvx_development_events WHERE entity_id=? ORDER BY rowid', recipientMission.agentId);
  const admissions = rows.map(row => JSON.parse(row.payload_json)).filter(row => row.kind === 'worker_dossier_transport_admission');
  const admitted = admissions.some(row => row.receipt.sourceRunId === sourceRunId && row.receipt.recipientRunId === recipient.executionRun.id);
  const measured = await Promise.all([sourceRunId, recipient.executionRun.id].map(runId => relay.measuredQwen(db, { runId, model })));
  const recipientStatus = await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', recipient.executionRun.id);
  write('assessment.json', { status: admitted && measured.every(Boolean) && recipientStatus.status === 'completed' ? 'passed' : 'failed',
    scope: 'Runtime transport admission and metered worker completion only', genosSemanticOracle: false,
    semanticAccepted: false, sourceRunId, recipientRunId: recipient.executionRun.id, measured, admissions,
    cumulativeUsage: await require(`${services}workerDossierHandoffService`).usage(db, producerMission.modelBudgetScope.id) });
  write('database-before-close.json', await relay.state(db));
}

async function main() {
  const config = prepare();
  const [version, tags] = await Promise.all(['version', 'tags'].map(async endpoint =>
    (await fetch(`http://127.0.0.1:11435/api/${endpoint}`)).json()));
  write('environment.json', { node: process.version, version, models: tags.models });
  const database = require('../../backend/src/db');
  const db = await database.getDatabase();
  const identity = require('../../backend/src/services/missionIdentityService');
  const parentId = require('../../backend/src/services/orchestratorIdFactory').createOrchestratorId('live_handoff');
  const missionId = identity.newMissionId();
  const request = { workspaceRoot: config.workspace, execution_budget: { tokens: config.parentTokens, costUsd: 1 }, workerTokenLimit: config.workerTokens };
  const context = { orchestratorId: parentId, missionId, request };
  try {
    await require('../../backend/bin/directWorkerMissionInitialization.cjs').initializeDirectWorkerMission(
      { db, orchestratorId: parentId, missionId, request, task: 'Bounded live dossier handoff' },
      { initializeMission: require('../../backend/bin/orchestratorActions.cjs').initializeMission, missionIdentity: identity });
    write('identity.json', { parentId, missionId });
    await execute(db, { config, parentId, missionId, context });
  } finally {
    await require('../../backend/src/services/runtimeMissionTasks').drain();
    await require('../../backend/bin/directWorkerBudgetScope.cjs').closeParentBudgetRun(db, context, 'cancelled');
    if ((await identity.get(db, missionId))?.status === 'active') await identity.setStatus(db, missionId, 'cancelled');
    await require('../../backend/src/services/garageRuntimeService').stop(db);
    await require('../../backend/src/services/telemetryShutdownService').closeAfterFlush({
      telemetry: require('../../backend/src/services/telemetryObserver'), closeDatabase: database.closeDatabase });
    const sourceUnchanged = git(['rev-parse', 'HEAD']).stdout.trim() === config.revision && !git(['status', '--porcelain']).stdout.trim();
    write('completion.json', { revision: config.revision, sourceUnchanged, ended: new Date().toISOString() });
    if (!sourceUnchanged) throw new Error('Live handoff source changed during execution.');
  }
}
main().catch(error => { if (fs.existsSync(output)) write('error.json', { code: error.code, error: error.message, stack: error.stack }); console.error(error); process.exitCode = 1; });
