'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const originals = require('./honestWorkerOriginals.cjs');
const { boundaryCheck } = require('./honestWorkerBoundaryChecks.cjs');

const runtimeRoot = path.resolve(process.env.HONEST_WORKER_RUNTIME_ROOT || path.join(__dirname, '../..'));
const runtime = name => require(path.join(runtimeRoot, 'backend', name));

async function start() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-honest-worker-'));
  process.env.GENOS_DISABLE_DOTENV = '1';
  process.env.GENOS_DB_PATH = path.join(root, 'receipts.sqlite');
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  process.env.GENOS_ADMIN_PASSWORD = 'honest-worker-ci-only';
  process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'honest-worker-ci-ledger-only';
  const db = await runtime('src/db').getDatabase(process.env.GENOS_DB_PATH);
  await runtime('src/services/garageRuntimeService').stop(db);
  await db.run("INSERT INTO organizations(id,name) VALUES('honest-ci-org','Honest finite CI')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES('honest-ci-project','honest-ci-org','Honest finite CI')");
  return { root, db, runtimeRoot, sequence: 0 };
}

async function close(context) {
  await runtime('src/db').closeDatabase();
  if (process.env.HONEST_WORKER_KEEP_ARTIFACTS === '1') return;
  const root = path.resolve(context.root);
  if (!root.startsWith(path.resolve(os.tmpdir()) + path.sep)
    || !path.basename(root).startsWith('genos-honest-worker-')) throw Error('Unsafe CI cleanup path');
  await fs.rm(root, { recursive: true, force: true });
}

function contract(task, baselineSource = originals[task].source) {
  const profiles = { T1: { functions: ['durationMinutes'],
    domains: { functions: { durationMinutes: ['iso8601', 'iso8601'] } } },
  T2: { functions: ['stableSort'], postconditions: { stableSort: ['preserveArguments', 'newResult'] },
    domains: { functions: { stableSort: ['numericKeyRecords'] } } },
  T3: { constructors: { WriteCache: ['set', 'get', 'flush'] },
    domains: { constructors: { WriteCache: [] }, methods: { WriteCache: {
      set: ['string', 'json'], get: ['string'], flush: [] } } } } };
  return { version: 1, contractId: 'generated_boundary_tests_v1', sourcePaths: ['module.cjs'],
    sourceHashes: { 'module.cjs': crypto.createHash('sha256').update(baselineSource).digest('hex') },
    generatedTestPath: 'boundary-cases.json', visibleTestPaths: ['visible.test.cjs'], api: profiles[task],
    visibleCommand: 'node visible.test.cjs', command: 'node .genos/boundary-check.cjs' };
}

async function identity(context, id, workspaceRoot) {
  const orchestratorId = `honest-owner-${id}`;
  const agentId = `honest-worker-${id}`;
  const missionId = `honest-mission-${id}`;
  const workspaceId = `honest-ws-${id}`;
  await context.db.run(`INSERT INTO workspaces(id,name,path,organization_id,project_id)
    VALUES(?, ?, ?, 'honest-ci-org', 'honest-ci-project')`, workspaceId, `Offline CI ${id}`, workspaceRoot);
  await context.db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id,current_task)
    VALUES(?, ?, 'orchestrator', 'idle', 'orchestrator', ?, 'finite boundary CI')`, orchestratorId, `CI owner ${id}`, workspaceId);
  await context.db.run(`INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id,current_task)
    VALUES(?, ?, 'implementation', 'idle', 'worker', ?, ?, 'finite boundary CI')`, agentId, `CI worker ${id}`, orchestratorId, workspaceId);
  await runtime('src/services/missionIdentityService').create(context.db, {
    missionId, objective: 'Verify the declared finite differential CI contract.', orchestratorAgentId: orchestratorId });
  await runtime('src/services/missionIdentityService').attachAgent(context.db, { missionId, agentId, role: 'implementation' });
  const contractRecord = await runtime('src/services/strategyContractService').saveContract(context.db,
    { agentId: orchestratorId, workspaceId, problem: 'Execute the declared finite differential CI checks.' });
  const run = await runtime('src/services/strategyExecutionService').createExecutionRun(context.db,
    { agentId, missionId, contractRecord, budget: { tokens: 1000, events: 100, latencyMs: 60000 } });
  return { agentId, missionId, workspaceId, run };
}

async function prepare(context, fixture, options = {}) {
  context.sequence += 1;
  const id = `${fixture.id}-${context.sequence}`;
  const workspaceRoot = path.join(context.root, id);
  await fs.mkdir(workspaceRoot);
  const original = originals[fixture.task];
  const baselineSource = options.baseline || original.source;
  await fs.writeFile(path.join(workspaceRoot, 'module.cjs'), baselineSource);
  await fs.writeFile(path.join(workspaceRoot, 'visible.test.cjs'), original.visible);
  await fs.writeFile(path.join(workspaceRoot, 'boundary-cases.json'), '{"schema":"genos.boundary-cases/v1","cases":[]}\n');
  await fs.writeFile(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'node visible.test.cjs' } }));
  const scope = await identity(context, id, workspaceRoot);
  const mission = { agentId: scope.agentId, missionId: scope.missionId, workspaceId: scope.workspaceId,
    workspaceRoot, role: 'implementation', workerKind: 'bounded_worker',
    boundaryTestContract: contract(fixture.task, baselineSource) };
  const patches = [{ path: 'module.cjs', content: fixture.source },
    { path: 'boundary-cases.json', content: options.check || boundaryCheck(fixture.task) }];
  return { workspaceRoot, db: context.db, mission, executionRun: scope.run,
    allowedCommands: ['node visible.test.cjs', 'node .genos/boundary-check.cjs'],
    text: JSON.stringify({ format: 'genos.file-replacement/v1', patches,
      tests: ['node visible.test.cjs', 'node .genos/boundary-check.cjs'],
      evidence: 'Offline CI declaration; actual execution determines the finite claim.' }) };
}

async function execute(context, fixture, options) {
  const input = await prepare(context, fixture, options);
  const proposal = await runtime('src/services/localCodeWorkerService').executeProposal(input);
  return { input, proposal };
}

module.exports = { start, close, contract, prepare, execute, runtime };
