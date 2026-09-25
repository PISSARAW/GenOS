'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { getDatabase, closeDatabase } = require('../src/db');
const fleet = require('../src/services/agentFleetWorkers');
const runtime = require('../src/services/agentRuntimeAdapter');
const kinds = require('../src/services/agents/workerKindService');
const contracts = require('../src/services/strategyContractService');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const { assertRuntimeContract, assertWorkerToolAllowed } = require('../src/services/agents/workerContractEnforcement');
const { extractEvidenceReport } = require('../src/services/agentEvidenceService');
const { workerComplianceScenario } = require('./fixtures/workerComplianceScenarios');

function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function includesReference(value, reference) {
  return JSON.stringify(value || {}).includes(reference);
}

function validateExpectedRefusals(kind, contract) {
  const wrongType = kinds.kindDefinition(kind).artifact === 'dossier' ? 'verification_report' : 'dossier';
  const invalid = { events: [{ evidenceReport: { workerArtifact: { type: wrongType, content: {}, provenance: { source: 'refusal-fixture' } } } }] };
  let artifactRejected = false;
  let actionRejected = false;
  let identityRejected = false;
  try { validateWorkerArtifact(invalid, { agentId: kind, workerContract: contract }); } catch (error) { artifactRejected = error.code === 'INVALID_WORKER_ARTIFACT'; }
  try { assertWorkerToolAllowed(contract, 'genos_topology_session'); } catch (error) { actionRejected = error.code === 'WORKER_CONTRACT_DENIED'; }
  try { assertRuntimeContract({ ...contract, identity: { ...contract.identity, workerKind: 'unknown_worker' } }, kind); } catch (error) { identityRejected = error.code === 'INVALID_WORKER_CONTRACT'; }
  return artifactRejected && actionRejected && identityRejected;
}

async function seedParent(options) {
  const { db, parentId, workspaceId, workspaceRoot } = options;
  await db.run('INSERT OR IGNORE INTO workspaces (id,name,path,language) VALUES (?,?,?,?)', workspaceId, `Isolated worker compliance ${workspaceId}`, workspaceRoot, 'TypeScript');
  await db.run(`INSERT OR IGNORE INTO agents (id,name,role,status,agent_type,execution_mode,workspace_id,cognitive_budget,cognitive_baseline_budget,model_tier,language,isolation_mode,parent_agent_id,metadata_json) VALUES (?,?,?,'idle',?,'orchestrator',?,100000,100000,'Local','TypeScript','Branch',NULL,'{}')`, parentId, 'Compliance orchestrator', 'compliance', 'GenOS', workspaceId);
  const contract = contracts.buildStrategyContract({ mission: 'Run one isolated worker kind compliance mission.', allowPrototype: true });
  if (!(await contracts.getLatestContract(db, parentId, workspaceId))) await contracts.saveContract(db, { agentId: parentId, workspaceId, contract, createdBy: 'worker-compliance-harness' });
}

async function missionFor(context) {
  const { db, parentId, workspaceId, kind, model, scenario } = context;
  const strategy = await contracts.getLatestContract(db, parentId, workspaceId);
  const assignment = { workerKind: kind, role: kind, label: `compliance-${kind}`, hypothesis: `Produce the contract artifact from ${scenario.sourceRef}.`, capabilities: [], modelTier: 'Local' };
  const created = await fleet.createAutonomousWorkers(db, { id: parentId, agent_type: 'GenOS' }, {
    plan: { strategyContract: { primary: strategy.contract.selected_strategy.primary }, tokenPolicy: { total: 5000, workerShare: 0.6, orchestratorReserve: 0.4, allocation: 'fixed' }, dispatchWorkers: [assignment] },
    mission: { prompt: `${scenario.prompt} Verified fixture receipt: ${JSON.stringify(scenario.receipt)}. Source evidence: ${scenario.sourceRef} Analyze this synthetic fixture only. Do not access or modify repository files.`, workspaceRoot: context.rootWorkspace, capsuleRoot: process.env.GENOS_CAPSULE_ROOT, executionPolicy: { allowFileEdits: false }, executionBudget: { tokens: 5000, events: 40, latencyMs: Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000 }, timeoutMs: Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000, executor: 'local', localRuntime: true, localModel: model }
  });
  return created[0];
}

async function validateMission(context) {
  const { db, worker, metadata, parentId, kind, scenario, execution } = context;
  const { agent, report, eventPayload } = await readWorkerOutcome(db, worker.agentId);
  const artifactValidationError = validateArtifactForMission(report, worker.agentId, metadata.workerContract);
  const expected = kinds.kindDefinition(kind).artifact;
  const artifact = report?.workerArtifact?.type || null;
  const correctReference = hasFixtureReference(report, scenario.sourceRef);
  const refusalsValidated = validateExpectedRefusals(kind, metadata.workerContract);
  const persistedContract = metadata.workerKind === kind && metadata.workerContract.identity.workerKind === kind;
  const parentBound = metadata.workerContract.identity.parentId === parentId;
  const runtimeStarted = Boolean(execution);
  const passed = successfulOutcome({ agent, report, artifact, expected, correctReference, refusalsValidated, persistedContract, parentBound, runtimeStarted });
  return { runId: process.env.GENOS_COMPLIANCE_RUN_ID, kind, workerId: worker.agentId, persistedContract, parentBound, runtimeStarted, status: agent.status, outcome: report?.outcome || null, expectedArtifact: expected, artifact, sourceEvidenceValidated: correctReference, refusalsValidated, stageTimings: eventPayload.stageTimings || {}, artifactDiagnostics: eventPayload.workerArtifactDiagnostics || null, passed, error: passed ? null : artifactValidationError || execution?.error || report?.error || 'Positive evidence or expected refusal scenarios did not satisfy the contract.' };
}

function validateArtifactForMission(report, workerId, workerContract) {
  if (!report) return null;
  try {
    validateWorkerArtifact({ events: [{ evidenceReport: report }] }, { agentId: workerId, workerContract });
    return null;
  } catch (error) { return error.message; }
}

async function readWorkerOutcome(db, workerId) {
  const agent = await db.get('SELECT status FROM agents WHERE id = ?', workerId);
  const row = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED','AGENT_FAILED','AGENT_HALTED') ORDER BY id DESC LIMIT 1", workerId);
  const event = row ? JSON.parse(row.payload_json) : null;
  return { agent, report: event ? extractEvidenceReport(event) : null, eventPayload: event?.payload || event || {} };
}

function hasFixtureReference(report, sourceRef) {
  return includesReference(report?.claims, sourceRef) || includesReference(report?.workerArtifact, sourceRef);
}

function successfulOutcome(result) {
  return result.persistedContract && result.parentBound && result.runtimeStarted
    && result.agent.status === 'completed' && result.report?.outcome === 'success'
    && result.artifact === result.expected && result.correctReference && result.refusalsValidated;
}

function saveResult(result) {
  const reportPath = path.join(process.env.GENOS_COMPLIANCE_ROOT, 'worker-compliance-report.json');
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : { isolatedRoot: process.env.GENOS_COMPLIANCE_ROOT, database: process.env.GENOS_DB_PATH, workspaceRoot: process.env.GENOS_WORKSPACE_ROOT, capsuleRoot: process.env.GENOS_CAPSULE_ROOT, model: process.env.GENOS_LOCAL_MODEL, results: [] };
  const key = (entry) => `${entry.runId}:${entry.kind}`;
  report.results = [...report.results.filter((entry) => key(entry) !== key(result)), result];
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

async function runOne({ runId, kind }) {
  const model = process.env.GENOS_LOCAL_MODEL;
  if (!model) throw new Error('Set GENOS_LOCAL_MODEL to an explicitly selected local model URI.');
  const rootWorkspace = path.join(process.env.GENOS_WORKSPACE_ROOT, kind);
  fs.mkdirSync(rootWorkspace, { recursive: true });
  const workspaceId = `compliance-workspace-${runId}-${kind}`;
  const parentId = `compliance-parent-${runId}-${kind}`;
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  let context = null;
  let execution = null;
  try {
    context = await createWorkerContext({ db, parentId, workspaceId, rootWorkspace, kind, model, runId });
    execution = await executeWorkerMission(context);
    const result = await validateMission({ ...context, db, execution });
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    const result = failedMissionResult({ runId, kind, parentId, error, context, execution });
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  } finally {
    await require('../src/services/telemetryObserver').flush(5000).catch(() => undefined);
    await closeDatabase();
  }
}

function failedMissionResult(options) {
  const { runId, kind, parentId, error, context, execution } = options;
  return {
    runId,
    kind,
    workerId: context?.worker?.agentId || null,
    persistedContract: Boolean(context?.metadata?.workerContract?.identity?.workerKind === kind),
    parentBound: Boolean(context?.metadata?.workerContract?.identity?.parentId === parentId),
    runtimeStarted: Boolean(execution),
    status: execution ? 'execution_failed' : 'not_started',
    outcome: null,
    expectedArtifact: kinds.kindDefinition(kind).artifact,
    artifact: null,
    sourceEvidenceValidated: false,
    refusalsValidated: context ? validateExpectedRefusals(kind, context.metadata.workerContract) : false,
    stageTimings: {},
    artifactDiagnostics: null,
    passed: false,
    error: error.message
  };
}

async function createWorkerContext(options) {
  const { db, parentId, workspaceId, rootWorkspace, kind, model, runId } = options;
  await seedParent({ db, parentId, workspaceId, workspaceRoot: rootWorkspace });
  const scenario = workerComplianceScenario(kind);
  const worker = await missionFor({ db, parentId, workspaceId, kind, model, scenario });
  const row = await db.get('SELECT metadata_json FROM agents WHERE id = ?', worker.agentId);
  const metadata = JSON.parse(row.metadata_json);
  if (metadata.workerKind !== kind || metadata.workerContract?.identity?.workerKind !== kind) throw new Error(`Persistent worker contract mismatch for ${kind}.`);
  if (!inside(process.env.GENOS_CAPSULE_ROOT, worker.workspaceRoot || rootWorkspace)) throw new Error(`Worker workspace escaped isolated capsule root: ${worker.workspaceRoot}`);
  return { db, runId, worker, metadata, parentId, workspaceId, rootWorkspace, kind, model, scenario };
}

async function executeWorkerMission(context) {
  const { worker, metadata, parentId, workspaceId, rootWorkspace, kind, model } = context;
  const timeoutMs = Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000;
  try {
    return await runtime.startMission({ agentId: worker.agentId, orchestratorAgentId: parentId, role: worker.role, workerKind: kind, workerContract: metadata.workerContract, prompt: worker.prompt, workspaceId, workspaceRoot: worker.workspaceRoot || rootWorkspace, workspaceProvisioned: true, executor: 'local', localRuntime: true, localModel: model, modelTier: 'Local', timeoutMs, executionBudget: { ...worker.executionBudget, tokens: 5000, events: 40, latencyMs: timeoutMs }, executionPolicy: { allowFileEdits: false, silentUpdates: true }, toolLease: worker.toolLease || [], silentUpdates: true });
  } catch (error) { return { error: error.message }; }
}

module.exports = { runOne };
