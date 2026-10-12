'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const repo = path.resolve(__dirname, '..', '..');
const backend = path.join(repo, 'backend');
const requestedKind = process.argv[2];
const outputRoot = process.argv[3];
if (!requestedKind || !/^[a-z_]+$/.test(requestedKind) || !outputRoot || !path.isAbsolute(outputRoot)) {
  throw new Error('Usage: node benchmarks/attention-workers/run.cjs <worker-kind> <absolute-output-root>');
}
const root = path.join(outputRoot, 'work', `real-workers-${randomUUID()}`);
const output = path.join(outputRoot, 'outputs', `real-worker-${requestedKind}.json`);
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = `attention-test-${randomUUID()}`;
process.env.NODE_ENV = 'test';
process.env.GENOS_DB_PATH = path.join(root, 'genos.db');
process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
process.env.GENOS_WORKSPACES_ROOT = root;
process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= randomBytes(32).toString('hex');
process.env.GENOS_SNAPSHOT_ROOT = path.join(outputRoot, 'snapshots');
process.env.TMP = path.join(outputRoot, 'work', 'tmp');
process.env.TEMP = process.env.TMP;
process.env.TMPDIR = process.env.TMP;
const { getDatabase, closeDatabase } = require(path.join(backend, 'src', 'db'));
const fleet = require(path.join(backend, 'src', 'services', 'agentFleetWorkers'));
const runtime = require(path.join(backend, 'src', 'services', 'agentRuntimeAdapter'));
const strategy = require(path.join(backend, 'src', 'services', 'strategyContractService'));
const kinds = require(path.join(backend, 'src', 'services', 'agents', 'workerKindService'));
const artifact = require(path.join(backend, 'src', 'services', 'agents', 'workerArtifactContract'));
const { fixtures } = require(path.join(backend, 'tests', 'helpers', 'nativeWorkerFixtures'));
if (!Object.hasOwn(kinds.KINDS, requestedKind)) throw new Error(`Unknown worker kind: ${requestedKind}`);

const summary = { repository: repo, runRoot: root, startedAt: new Date().toISOString(),
  types: [requestedKind], results: [] };
async function persist() { await fs.writeFile(output, JSON.stringify(summary, null, 2)); }

async function seed(db, kind, source) {
  const parent = `attention-parent-${kind}`;
  const ws = `attention-ws-${kind}`;
  const mission = `attention-mission-${kind}`;
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    ws, kind, source, 'attention-org', 'attention-project');
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,cognitive_budget,agent_type) VALUES (?,?,?,'running','orchestrator',?,1000000,'GenOS')",
    parent, parent, 'orchestrator', ws);
  await db.run('INSERT INTO missions (mission_id,objective,orchestrator_agent_id) VALUES (?,?,?)', mission, `Exercise ${kind}`, parent);
  await db.run('INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,?,?)', mission, parent, 'orchestrator');
  await strategy.saveContract(db, { agentId: parent, workspaceId: ws, problem: `Exercise ${kind}` });
  return { parent, ws, mission };
}

function probeMethod(kind, method) {
  const copy = structuredClone(method);
  const p = copy.parameters;
  if (kind === 'scout_cell') {
    p.sources = [
      { sourceRef: 'corpus://noise/1', text: 'invoice 314; meeting room A' },
      { sourceRef: 'corpus://target', text: 'invoice 417; approved' },
      { sourceRef: 'corpus://noise/2', text: 'invoice 741; gardening' }
    ];
    p.terms = ['417'];
  }
  if (kind === 'resident_daemon') p.samples.push({ value: 1, sourceRef: 'samples://noise', observedAt: '2026-10-06T10:01:00Z' });
  if (kind === 'bounded_worker' || kind === 'symbiotic_worker' || kind === 'teaching_worker') {
    p.procedure.parameters.values.push(100);
  }
  if (kind === 'procedural_executor') p.values.push(100);
  if (kind === 'synthesis_worker') p.sources.push({ sourceRef: 'source://noise', claim: 'Meeting room', position: 'A' });
  if (kind === 'forensic_worker') p.events.push({ id: 'weather', occurredAt: '2026-10-06T09:00:00Z', sourceRef: 'incident://noise/weather' });
  return copy;
}

function missionPlan(input) {
  const { kind, source, ids, methodContract } = input;
  const mission = { missionId: ids.mission, prompt: `Execute the attention probe for ${kind} and preserve evidence.`,
    workspaceRoot: source, methodContract, executor: 'local', executionPolicy: { allowFileEdits: false },
    executionBudget: { events: 100 }, timeoutMs: 30000 };
  if (kind === 'symbiotic_worker') {
    mission.hostContractId = 'attention-host';
    mission.hostCapabilities = ['deterministic_procedure'];
  }
  if (kind === 'recovery_worker') mission.recoveryLease = { action: 'restore_checkpoint', path: 'state.txt' };
  const assignment = { role: kind, workerKind: kind, label: kind,
    hypothesis: 'Use only the relevant structured input.', capabilities: [], methodContract };
  if (kind === 'symbiotic_worker') {
    assignment.hostContractId = 'attention-host';
    assignment.hostCapabilities = ['deterministic_procedure'];
  }
  const plan = { dispatchWorkers: [assignment],
    strategyContract: { primary: 'tree-search' },
    tokenPolicy: { total: 2000, workerShare: 1, orchestratorReserve: 0,
      rounds: { initial: { perWorkerTokens: 2000 } } } };
  return { mission, plan };
}

async function reportValidation(db, agentId, evidenceReport) {
  try {
    const metadata = await db.get('SELECT metadata_json FROM agents WHERE id=?', agentId);
    const workerContract = JSON.parse(metadata.metadata_json).workerContract;
    const artifactValid = artifact.validateWorkerArtifact({ events: [{ evidenceReport }] }, { agentId, workerContract });
    return { artifactValid };
  } catch (error) { return { artifactValid: false, artifactError: `${error.code || error.name}: ${error.message}` }; }
}

async function evidenceFor(db, agentId) {
  const event = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type='EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1", agentId);
  if (!event) return { executed: false, artifactValid: false };
  const evidenceReport = JSON.parse(event.payload_json).evidenceReport;
  return { executed: true, evidenceReport, ...await reportValidation(db, agentId, evidenceReport) };
}

function runFor(db, agentId) {
  return db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', agentId);
}

async function childrenFor(db, parentId) {
  const children = await db.all('SELECT id,status FROM agents WHERE parent_agent_id=?', parentId);
  for (const child of children) {
    Object.assign(child, await evidenceFor(db, child.id));
    child.run = await runFor(db, child.id);
  }
  return children;
}

async function executeKind(db, input) {
  const { kind, ids, methodContract, mission, plan } = input;
  const workers = await fleet.createAutonomousWorkers(db, { id: ids.parent, agent_type: 'GenOS' }, { plan, mission });
  const worker = workers[0];
  await fs.mkdir(path.join(worker.workspaceRoot, '.genos', 'workspace-snapshots'), { recursive: true });
  await db.run('INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,?,?)', ids.mission, worker.agentId, kind);
  const started = await runtime.startMission({ ...mission, workspaceRoot: worker.workspaceRoot,
    workspaceProvisioned: true, agentId: worker.agentId, role: worker.role,
    workerKind: worker.workerKind, methodContract: worker.methodContract || methodContract,
    orchestratorAgentId: ids.parent, workspaceId: worker.workspaceId });
  const row = { kind, methodId: methodContract.methodId, created: true, agentId: worker.agentId,
    workspaceId: worker.workspaceId, startResult: { started: started.started,
      code: started.code || null, error: started.error || null },
    ...await evidenceFor(db, worker.agentId), run: await runFor(db, worker.agentId) };
  if (kind === 'sub_orchestrator') row.children = await childrenFor(db, worker.agentId);
  return row;
}

async function runKind(db, kind) {
  const source = path.join(root, `source-${kind}`);
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, 'task.txt'), `Worker attention test: ${kind}`);
  await fs.writeFile(path.join(source, 'state.txt'), 'damaged');
  const ids = await seed(db, kind, source);
  const methodContract = probeMethod(kind, fixtures(source)[kind]);
  const { mission, plan } = missionPlan({ kind, source, ids, methodContract });
  let row;
  try { row = await executeKind(db, { kind, ids, methodContract, mission, plan }); }
  catch (error) { row = { kind, methodId: methodContract.methodId, created: false, executed: false,
    artifactValid: false, error: { code: error.code || error.name, message: error.message } }; }
  summary.results.push(row);
  await persist();
  console.log(`${kind}: ${row.created ? 'created' : 'not-created'}, ${row.executed ? 'evidence' : 'no-evidence'}, ${row.artifactValid ? 'valid' : 'unverified'}${row.error ? `, ${row.error.code}` : ''}`);
}

async function main() {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(process.env.GENOS_SNAPSHOT_ROOT, { recursive: true });
  await fs.mkdir(process.env.TMP, { recursive: true });
  await persist();
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await db.run("INSERT INTO organizations (id,name) VALUES ('attention-org','Attention test')");
    await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('attention-project','attention-org','Attention test')");
    for (const kind of summary.types) await runKind(db, kind);
  } finally {
    summary.completedAt = new Date().toISOString();
    await persist();
    await require(path.join(backend, 'src', 'services', 'garageRuntimeService')).stop(db);
    await require(path.join(backend, 'src', 'services', 'telemetryObserver')).flush();
    await closeDatabase();
  }
  console.log(`TOTAL ${summary.results.filter(r => r.executed && r.artifactValid).length}/${summary.types.length} with valid evidence`);
}
main().catch(async e => { summary.fatal = { code: e.code || e.name, message: e.message }; await persist(); console.error(e); process.exitCode = 1; });
