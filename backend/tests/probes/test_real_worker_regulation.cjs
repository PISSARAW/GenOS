'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const project = process.env.GENOS_REGULATION_OUTPUT_DIR || path.join(__dirname, '.regulation-results');
const work = path.join(project, 'work');
const source = path.resolve(__dirname, '../..');
fs.mkdirSync(path.join(project, 'outputs'), { recursive: true });
const root = path.join(work, `workers-real-${Date.now()}-${process.pid}`);
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'state.txt'), 'damaged');
process.env.GENOS_DB_PATH = path.join(root, 'genos.db');
process.env.GENOS_ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
process.env.GENOS_ADMIN_TOKEN = crypto.randomBytes(24).toString('hex');

const { getDatabase, closeDatabase } = require(path.join(source, 'src/db'));
const { fixtures, missionFor } = require(path.join(source, 'tests/helpers/nativeWorkerFixtures'));
const { KINDS } = require(path.join(source, 'src/services/agents/workerKindService'));
const { hashContract } = require(path.join(source, 'src/services/strategyContractService'));
const { runDeterministicWorker } = require(path.join(source, 'src/services/agents/deterministicWorkerRuntime'));
const regulatory = require(path.join(source, 'src/services/regulation/regulatoryStateService'));
const bridge = require(path.join(source, 'src/services/regulation/regulatoryBridgeService'));

const initial = { energy: 0.2, integrity: 0.3, survival: 0.8, stress: 0.9,
  hormones: { cortisol: 0.9 } };
const tracked = (snapshot) => ({ energy: snapshot.drives.energy, integrity: snapshot.drives.integrity,
  survival: snapshot.drives.survival, stress: snapshot.modulators.stress,
  cortisol: snapshot.modulators.cortisol });

async function setup(db, kind, mission) {
  const id = mission.agentId;
  const contract = { execution_pipeline: [], strategy_portfolio: [], promotion: {} };
  const contractId = `contract-${kind}`;
  const runId = `run-${kind}`;
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,parent_agent_id,metadata_json) VALUES (?,?,?,'idle','worker','ws','native-parent',?)",
    id, id, kind, JSON.stringify({ workerKind: kind, workerContract: mission.workerContract }));
  if (kind === 'sub_orchestrator') await db.run('INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,?,?)', 'probe-mission', id, kind);
  await db.run('INSERT INTO strategy_contracts (id,agent_id,workspace_id,version,primary_strategy,contract_hash,contract_json) VALUES (?,?,?,?,?,?,?)',
    contractId, id, 'ws', 1, 'regulation-probe', hashContract(contract), JSON.stringify(contract));
  await db.run("INSERT INTO strategy_execution_runs (id,agent_id,contract_id,contract_version,status,budget_json,metrics_json) VALUES (?,?,?,1,'planned',?,?)",
    runId, id, contractId, JSON.stringify({ tokens: 0, deterministic: true, latencyMs: 300000, costUsd: 1 }),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0, events: 0 }));
  return runId;
}

async function runOne(db, kind, method) {
  const mission = missionFor(kind, method, root);
  mission.timeoutMs = kind === 'sub_orchestrator' ? 10000 : 300000;
  const runId = await setup(db, kind, mission);
  regulatory.updateState(mission.agentId, initial);
  const before = bridge.toSnapshot(mission.agentId);
  let execution;
  try { execution = await runDeterministicWorker(db, mission, { id: runId }); }
  catch (error) { execution = { started: false, code: error.code || 'THROWN', error: error.message }; }
  const after = bridge.toSnapshot(mission.agentId);
  const agent = await db.get('SELECT status FROM agents WHERE id=?', mission.agentId);
  const run = await db.get('SELECT status,guardrail_reason,metrics_json FROM strategy_execution_runs WHERE id=?', runId);
  const metrics = JSON.parse(run.metrics_json);
  return { kind, workerId: mission.agentId, runId, methodId: method.methodId,
    started: execution.started === true, code: execution.code || null,
    error: execution.error || null, agentStatus: agent.status, runStatus: run.status,
    guardrail: run.guardrail_reason, events: metrics.events,
    receiptId: execution.result?.receipt?.id || null,
    before: tracked(before), after: tracked(after),
    functionalAfter: after.drives.energy >= 0.4 && after.drives.integrity >= 0.5 && after.drives.survival < 0.7 && after.modulators.stress <= 0.7,
    regulatoryRevisionBefore: before.revision, regulatoryRevisionAfter: after.revision,
    modeAfter: regulatory.getState(mission.agentId).cognitive.mode };
}

async function main() {
  const db = await getDatabase();
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?)', 'probe-org', 'Regulation probe');
  await db.run('INSERT INTO projects (id,organization_id,name) VALUES (?,?,?)',
    'probe-project', 'probe-org', 'Real workers');
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    'ws', 'real worker regulation probe', root, 'probe-org', 'probe-project');
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('native-parent','native-parent','orchestrator','idle','orchestrator','ws')");
  await db.run("INSERT INTO missions (mission_id,objective,status,orchestrator_agent_id) VALUES ('probe-mission','Native worker regulation probe','active','native-parent')");
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('probe-mission','native-parent','orchestrator')");
  const methods = fixtures(root);
  const results = [];
  for (const kind of Object.keys(KINDS)) {
    const result = await runOne(db, kind, methods[kind]);
    results.push(result);
    process.stdout.write(`${kind}: ${result.agentStatus}/${result.runStatus}, regulation ${result.regulatoryRevisionBefore}->${result.regulatoryRevisionAfter}${result.code ? ` (${result.code})` : ''}\n`);
  }
  const child = await db.get("SELECT id,status FROM agents WHERE parent_agent_id='native-sub_orchestrator' AND execution_mode='worker' ORDER BY rowid DESC LIMIT 1");
  const childRun = child && await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', child.id);
  const childEvidence = child && await db.get("SELECT COUNT(*) AS count FROM telemetry_events WHERE agent_id=? AND event_type='EVIDENCE_REPORT'", child.id);
  const controlId = 'native-scout_cell';
  const controlBefore = bridge.toSnapshot(controlId);
  bridge.applyRpe(controlId, 1);
  const controlAfter = bridge.toSnapshot(controlId);
  const summary = { schema: 'genos.real-worker-regulation-probe/v1', runRoot: root,
    workerKinds: Object.keys(KINDS).length,
    completed: results.filter((item) => item.agentStatus === 'completed' && item.runStatus === 'completed').length,
    regulatoryChanged: results.filter((item) => JSON.stringify(item.before) !== JSON.stringify(item.after)).length,
    restored: results.filter((item) => item.functionalAfter).length,
    delegatedChild: child ? { id: child.id, agentStatus: child.status, runId: childRun?.id, runStatus: childRun?.status, evidenceReports: childEvidence?.count } : null,
    positiveControl: { revisionBefore: controlBefore.revision, revisionAfter: controlAfter.revision, stressBefore: controlBefore.modulators.stress, stressAfter: controlAfter.modulators.stress },
    results };
  const output = path.join(project, 'outputs', 'resultats-workers-genos.json');
  fs.writeFileSync(output, JSON.stringify(summary, null, 2));
  process.stdout.write(`Results: ${output}\n`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await closeDatabase();
  if (summary.completed !== summary.workerKinds || summary.restored !== summary.workerKinds) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
