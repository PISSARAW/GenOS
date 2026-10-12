'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const project = process.env.GENOS_REGULATION_OUTPUT_DIR || path.resolve(__dirname, '../../../../regulation-probe-results');
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
const { fixtures, missionFor, method, hash } = require(path.join(source, 'tests/helpers/nativeWorkerFixtures'));
const kinds = require(path.join(source, 'src/services/agents/workerKindService'));
const { KINDS } = kinds;
const { hashContract } = require(path.join(source, 'src/services/strategyContractService'));
const { runDeterministicWorker } = require(path.join(source, 'src/services/agents/deterministicWorkerRuntime'));
const regulatory = require(path.join(source, 'src/services/regulation/regulatoryStateService'));
const bridge = require(path.join(source, 'src/services/regulation/regulatoryBridgeService'));
const persistence = require(path.join(source, 'src/services/regulation/regulatoryPersistenceService'));
const recoveryEnabled = process.env.GENOS_REGULATION_RECOVERY === '1';
const tamperEnabled = process.env.GENOS_REGULATION_TAMPER === '1';
const supervisor = require(path.join(source, 'src/services/regulation/regulatorySupervisorService'));

const initial = { energy: 0.2, integrity: 0.3, survival: 0.8, stress: 0.9,
  hormones: { cortisol: 0.9 } };
const tracked = (snapshot) => ({ energy: snapshot.drives.energy, integrity: snapshot.drives.integrity,
  survival: snapshot.drives.survival, stress: snapshot.modulators.stress,
  cortisol: snapshot.modulators.cortisol });

async function setup(db, kind, mission) {
  const id = mission.agentId;
  const contract = { execution_pipeline: [], strategy_portfolio: [], promotion: {} };
  const contractId = `contract-${id}`;
  const runId = `run-${id}`;
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

async function setupRerun(db, mission, cycle) {
  const runId = `run-${mission.agentId}-cycle-${cycle}`;
  await db.run(`INSERT INTO strategy_execution_runs
    (id,agent_id,contract_id,contract_version,status,budget_json,metrics_json)
    VALUES (?,?,?,1,'planned',?,?)`, runId, mission.agentId, `contract-${mission.agentId}`,
    JSON.stringify({ tokens: 0, deterministic: true, latencyMs: 300000, costUsd: 1 }),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0, events: 0 }));
  return runId;
}

async function tamperFile(file) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { return await fs.promises.writeFile(file, 'tampered'); }
    catch (error) {
      if (!['EBUSY', 'EPERM'].includes(error.code) || attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function prepareRecovery(input) {
  const { db, mission, kind, checkpoint, cycle } = input;
  const relative = `regulation-${cycle}-${kind}.json`;
  const damaged = JSON.stringify(bridge.toSnapshot(mission.agentId));
  fs.writeFileSync(path.join(root, relative), damaged);
  const recoveryMethod = method('restore_checkpoint', { path: relative, content: checkpoint.content,
    checkpointDigest: checkpoint.digest, expectedCurrentDigest: hash(damaged) });
  const recovery = missionFor('recovery_worker', recoveryMethod, root);
  recovery.agentId = `repair-${cycle}-${kind}`;
  recovery.recoveryLease = { action: 'restore_checkpoint', path: relative };
  recovery.workerContract = kinds.buildWorkerContract('recovery_worker', recovery);
  const runId = await setup(db, 'recovery_worker', recovery);
  const result = await runDeterministicWorker(db, recovery, { id: runId });
  if (!result.started) throw new Error(`Recovery worker failed for ${kind}: ${result.code}`);
  if (tamperEnabled && kind === 'scout_cell') await tamperFile(path.join(root, relative));
  mission.regulatoryRecovery = { checkpointId: checkpoint.id, recoveryAgentId: recovery.agentId,
    recoveryRunId: runId, path: relative };
  mission.workerContract = kinds.buildWorkerContract(kind, mission);
  if (kind === 'sub_orchestrator') kinds.grantBoundedDelegation(mission.workerContract);
  await db.run('UPDATE agents SET metadata_json=? WHERE id=?',
    JSON.stringify({ workerKind: kind, workerContract: mission.workerContract }), mission.agentId);
  return { recoveryAgentId: recovery.agentId, recoveryRunId: runId, checkpointId: checkpoint.id, path: relative };
}

async function executeMission(db, mission, runId) {
  try { return await runDeterministicWorker(db, mission, { id: runId }); }
  catch (error) { return { started: false, code: error.code ?? 'THROWN', error: error.message }; }
}

async function durableAfter(input) {
  const { db, mission, execution, after } = input;
  if (!recoveryEnabled || !execution.started) return null;
  regulatory.hydrateState(mission.agentId, regulatory.createDefaultSnapshot(mission.agentId));
  const loaded = await persistence.sync(db, mission.agentId);
  return loaded.revision === after.revision && bridge.functional(bridge.toSnapshot(mission.agentId));
}

async function resultFor(db, input) {
  const { kind, cycle, mission, methodContract, runId, recovery, execution, before, after, durable } = input;
  const agent = await db.get('SELECT status FROM agents WHERE id=?', mission.agentId);
  const run = await db.get('SELECT status,guardrail_reason,metrics_json FROM strategy_execution_runs WHERE id=?', runId);
  return { kind, cycle, workerId: mission.agentId, runId, methodId: methodContract.methodId, recovery,
    started: execution.started === true, durable, code: execution.code ?? null,
    error: execution.error ?? null, agentStatus: agent.status, runStatus: run.status,
    guardrail: run.guardrail_reason, events: JSON.parse(run.metrics_json).events,
    receiptId: execution.result?.receipt?.id ?? null, before: tracked(before), after: tracked(after),
    functionalAfter: bridge.functional(after), regulatoryRevisionBefore: before.revision,
    regulatoryRevisionAfter: after.revision, modeAfter: regulatory.getState(mission.agentId).cognitive.mode };
}

async function runOne(db, input) {
  const { kind, method: methodContract, cycle } = input;
  const mission = missionFor(kind, methodContract, root);
  mission.timeoutMs = 300000;
  if (kind === 'recovery_worker') fs.writeFileSync(path.join(root, 'state.txt'), 'damaged');
  const runId = cycle === 1 ? await setup(db, kind, mission) : await setupRerun(db, mission, cycle);
  const checkpoint = recoveryEnabled ? await persistence.checkpoint(db, mission.agentId) : null;
  regulatory.updateState(mission.agentId, initial);
  const before = bridge.toSnapshot(mission.agentId);
  const recovery = recoveryEnabled ? await prepareRecovery({ db, mission, kind, checkpoint, cycle }) : null;
  const execution = await executeMission(db, mission, runId);
  const after = bridge.toSnapshot(mission.agentId);
  const durable = await durableAfter({ db, mission, execution, after });
  return resultFor(db, { kind, cycle, mission, methodContract, runId, recovery, execution, before, after, durable });
}

async function initializeProbe(db) {
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?)', 'probe-org', 'Regulation probe');
  await db.run('INSERT INTO projects (id,organization_id,name) VALUES (?,?,?)',
    'probe-project', 'probe-org', 'Real workers');
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    'ws', 'real worker regulation probe', root, 'probe-org', 'probe-project');
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('native-parent','native-parent','orchestrator','idle','orchestrator','ws')");
  await db.run("INSERT INTO missions (mission_id,objective,status,orchestrator_agent_id) VALUES ('probe-mission','Native worker regulation probe','active','native-parent')");
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('probe-mission','native-parent','orchestrator')");
}

async function executeMatrix(db, methods) {
  const results = [];
  const selectedKinds = tamperEnabled ? ['scout_cell'] : Object.keys(KINDS);
  const cycles = recoveryEnabled && !tamperEnabled ? 2 : 1;
  for (let cycle = 1; cycle <= cycles; cycle += 1) for (const kind of selectedKinds) {
    const result = await runOne(db, { kind, method: methods[kind], cycle });
    results.push(result);
    process.stdout.write(`${kind} cycle ${cycle}: ${result.agentStatus}/${result.runStatus}, regulation ${result.regulatoryRevisionBefore}->${result.regulatoryRevisionAfter}${result.code ? ` (${result.code})` : ''}\n`);
  }
  return { results, selectedKinds, cycles };
}

async function delegatedChild(db) {
  const child = await db.get("SELECT id,status FROM agents WHERE parent_agent_id='native-sub_orchestrator' AND execution_mode='worker' ORDER BY rowid DESC LIMIT 1");
  if (!child) return null;
  const run = await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', child.id);
  const evidence = await db.get("SELECT COUNT(*) AS count FROM telemetry_events WHERE agent_id=? AND event_type='EVIDENCE_REPORT'", child.id);
  return { id: child.id, agentStatus: child.status, runId: run?.id, runStatus: run?.status,
    evidenceReports: evidence?.count };
}

function positiveControl() {
  const controlId = 'native-scout_cell';
  const before = bridge.toSnapshot(controlId);
  bridge.applyRpe(controlId, 1);
  const after = bridge.toSnapshot(controlId);
  return { revisionBefore: before.revision, revisionAfter: after.revision,
    stressBefore: before.modulators.stress, stressAfter: after.modulators.stress };
}

async function replayGuard(db, results, methods) {
  if (!recoveryEnabled || tamperEnabled) return null;
  const first = results.filter((item) => item.kind === 'scout_cell').at(-1);
  const replay = missionFor('scout_cell', methods.scout_cell, root);
  replay.regulatoryRecovery = first.recovery;
  replay.workerContract = kinds.buildWorkerContract('scout_cell', replay);
  regulatory.updateState(first.workerId, { energy: 0.2 });
  try { await supervisor.ensureFunctional(db, replay); return false; }
  catch (failure) { return failure.code === 'REGULATORY_CHECKPOINT_INVALID'; }
}

async function summarize(db, matrix, methods) {
  const { results, selectedKinds, cycles } = matrix;
  return { schema: 'genos.real-worker-regulation-probe/v2', runRoot: root,
    workerKinds: selectedKinds.length, cycles, cases: selectedKinds.length * cycles,
    replayRefused: await replayGuard(db, results, methods),
    completed: results.filter((item) => item.agentStatus === 'completed' && item.runStatus === 'completed').length,
    regulatoryChanged: results.filter((item) => JSON.stringify(item.before) !== JSON.stringify(item.after)).length,
    restored: results.filter((item) => item.functionalAfter).length,
    durable: results.filter((item) => item.durable === true).length,
    delegatedChild: await delegatedChild(db), positiveControl: positiveControl(), results };
}

function outputName() {
  if (tamperEnabled) return 'resultats-workers-corrompus.json';
  return recoveryEnabled ? 'resultats-workers-recuperes.json' : 'resultats-workers-genos.json';
}

function expectedRefusal(item, code) {
  return item.code === code && item.runStatus === 'failed'
    && item.regulatoryRevisionBefore === item.regulatoryRevisionAfter;
}

function successfulRecovery(summary) {
  return summary.completed === summary.cases && summary.restored === summary.cases
    && summary.durable === summary.cases && summary.replayRefused === true;
}

function checkOutcome(summary) {
  if (tamperEnabled) return summary.results.every((item) => expectedRefusal(item, 'REGULATORY_RECOVERY_UNVERIFIED'));
  if (recoveryEnabled) return successfulRecovery(summary);
  return summary.results.every((item) => expectedRefusal(item, 'REGULATORY_RECOVERY_REQUIRED'));
}

async function main() {
  const db = await getDatabase();
  await initializeProbe(db);
  const methods = fixtures(root);
  const matrix = await executeMatrix(db, methods);
  const summary = await summarize(db, matrix, methods);
  const output = path.join(project, 'outputs', outputName());
  fs.writeFileSync(output, JSON.stringify(summary, null, 2));
  process.stdout.write(`Results: ${output}\n`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await closeDatabase();
  if (!checkOutcome(summary)) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
