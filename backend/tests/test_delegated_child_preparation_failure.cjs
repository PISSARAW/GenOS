'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { openDatabase } = require('./helpers/biologyDatabase');

async function fixture() {
  const base = process.platform === 'win32' ? 'D:/GenOS-runs' : os.tmpdir();
  const root = await fs.mkdtemp(path.join(base, 'child-preparation-test-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'pyproject.toml'), '[project]\nname="preparation-test"\nversion="0.0.0"\n');
  await fs.writeFile(path.join(workspace, 'parser.py'), 'def parse(lines):\n    return lines\n');
  const preload = path.join(root, 'provider.cjs');
  const services = path.resolve(__dirname, '../src/services');
  await fs.writeFile(preload, `
    const provider = require(${JSON.stringify(path.join(services, 'modelProvider'))});
    const discovery = require(${JSON.stringify(path.join(services, 'localModelDiscovery'))});
    discovery.discoverLocalModels = async () => [{uri:'ollama://qwen-test',chatCapable:true}];
    provider.generate = async options => {
      const planning = options.responseFormat?.name === 'genos_local_delegation_plan';
      const text = planning ? JSON.stringify({children:[
        {workerKind:'bounded_worker',mission:'Fix parser.py and test.',modelTokens:5000,mode:'code',dependsOn:-1},
        {workerKind:'verifier_worker',mission:'Review the tested code candidate.',modelTokens:5000,mode:'review',dependsOn:0}
      ]}) : '{}';
      return {text,provider:'ollama',model:'qwen-test',inputTokens:5,outputTokens:5,tokenUsageMeasured:true,
        ...(planning ? {} : {schemaViolation:{error:'TEST_REJECTED_CODE',violations:['No code candidate']}})};
    };
  `);
  return { root, workspace, preload };
}

async function assertEvidence(input, stdout, stderr) {
  assert.doesNotMatch(stderr, /GenOS orchestrator timed out|Database handle is closed/);
  const receipt = require('../../benchmarks/qwen-worker-missions/evidence-scope.cjs').cliReceipt(stdout);
  assert.ok(receipt, `CLI must return a parseable failed-worker receipt: ${stdout}\n${stderr}`);
  const db = openDatabase(path.join(input.root, 'test.db'));
  try {
    const refused = await db.all(`SELECT a.id,a.status,w.path,t.payload_json FROM agents a
      JOIN telemetry_events t ON t.agent_id=a.id AND t.event_type='DELEGATED_CHILD_PREPARATION_FAILED'
      JOIN workspaces w ON w.id=a.workspace_id`);
    assert.ok(refused.length > 0, 'Snapshot preparation after a failed code child must be recorded.');
    for (const child of refused) {
      assert.equal(child.status, 'error');
      assert.equal(JSON.parse(child.payload_json).started, false);
      assert.equal(await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=?', child.id), undefined);
      assert.ok((await fs.stat(child.path)).isDirectory(), 'The rejected preparation capsule remains inspectable.');
      const claims = await db.all("SELECT request_id FROM garage_queue WHERE worker_id=? AND status IN ('queued','claimed','running')", child.id);
      assert.equal(claims.length, 0);
    }
    assert.notEqual(receipt.agents.find(row => row.id === receipt.workerId).latest_run_status, 'completed');
  } finally { await db.close(); }
}

async function seedWorkspace(input) {
  const { getDatabase, closeDatabase } = require('../src/db');
  const db = await getDatabase(path.join(input.root, 'test.db'));
  try {
    await db.run("INSERT INTO organizations(id,name) VALUES ('preparation-org','Preparation test')");
    await db.run("INSERT INTO projects(id,organization_id,name) VALUES ('preparation-project','preparation-org','Preparation test')");
    await db.run(`INSERT INTO workspaces(id,name,path,organization_id,project_id)
      VALUES ('preparation-ws','Preparation test',?,'preparation-org','preparation-project')`, input.workspace);
  } finally { await closeDatabase(); }
}

async function activeChildIsPreserved() {
  const db = openDatabase();
  try {
    await db.exec(`CREATE TABLE agents (id TEXT, parent_agent_id TEXT, status TEXT,
      current_task TEXT, updated_at TEXT, runtime_pid INTEGER);
      CREATE TABLE strategy_execution_runs (agent_id TEXT);
      INSERT INTO agents VALUES ('active','parent','running','still active',NULL,123);`);
    await require('../src/services/agents/delegatedChildPreparationFailure').record(db,
      { parentId: 'parent', child: { agentId: 'active' }, error: new Error('late preparation failure') });
    assert.equal((await db.get("SELECT status FROM agents WHERE id='active'")).status, 'running');
  } finally { await db.close(); }
}

async function main() {
  await activeChildIsPreserved();
  const input = await fixture();
  await seedWorkspace(input);
  const request = { action: 'dispatch_worker', workspaceRoot: input.workspace,
    mission: 'Fix parser.py then delegate independent review of its tested candidate.',
    role: 'sub_orchestrator', workerKind: 'sub_orchestrator', executor: 'local',
    localModel: 'ollama://qwen-test', readOnlyWorkspaceEvidence: true, localContextTokens: 16384,
    workerTokenLimit: 12000, execution_budget: { tokens: 40000, costUsd: 1 }, timeoutMs: 20000,
    allowFileEdits: true, allowedWritePaths: ['parser.py'], allowedCommands: ['pytest'] };
  const result = await promisify(execFile)(process.execPath,
    ['--require', input.preload, path.resolve(__dirname, '../bin/genos-orchestrate.cjs'), JSON.stringify(request)],
    { timeout: 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
        GENOS_ADMIN_PASSWORD: 'child-preparation-test', GENOS_DB_PATH: path.join(input.root, 'test.db'),
        GENOS_STUDIO_ROOT: path.join(input.root, 'studio'), GENOS_CAPSULE_ROOT: path.join(input.root, 'capsules'),
        GENOS_WORKSPACES_ROOT: input.root, GENOS_GVX_LEDGER_HMAC_SECRET: 'child-preparation-test-secret-at-least-32-bytes' } });
  await fs.writeFile(path.join(input.root, 'output.log'), `${result.stdout}\n${result.stderr}`);
  await assertEvidence(input, result.stdout, result.stderr);
  console.log('PASS CLI terminates with preparation failure, no idle orphan, fabricated run or deleted capsule');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
