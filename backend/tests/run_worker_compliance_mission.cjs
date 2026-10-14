'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { getDatabase, closeDatabase } = require('../src/db');
const fleet = require('../src/services/agentFleetWorkers');
const runtime = require('../src/services/agentRuntimeAdapter');
const kinds = require('../src/services/agents/workerKindService');
const { hasNativeMethod } = require('../src/services/agents/workerExecutorRegistry');
const contracts = require('../src/services/strategyContractService');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const { assertRuntimeContract, assertWorkerToolAllowed } = require('../src/services/agents/workerContractEnforcement');
const { extractEvidenceReport } = require('../src/services/agentEvidenceService');
const { workerComplianceScenario } = require('./fixtures/workerComplianceScenarios');
const dossierCases = require('./workerComplianceDossierCases.cjs');
const subOrchestrator = require('./workerComplianceSubOrchestrator.cjs');
const structuredWorkers = require('./workerComplianceStructured.cjs');
const boundedCode = require('./boundedCodeWorkerQualification.cjs');
const { readExecutionRun, inspectOracle, oracleAccepted, missionError,
  successfulOutcome, saveResult, assertModelAvailable, deterministicMissionReference } = require('./workerComplianceEvidence.cjs');
const perceptionProbe = process.env.GENOS_COMPLIANCE_PERCEPTION === '1'
  ? require('./workerPerceptionProbe.cjs')
  : { INPUT: null, prepare() {}, async run() { return null; }, async settle() { return true; } };
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
  const organizationId = `${workspaceId}-organization`;
  const projectId = `${workspaceId}-project`;
  await db.run('INSERT OR IGNORE INTO organizations (id,name) VALUES (?,?)', organizationId, 'Worker compliance organization');
  await db.run('INSERT OR IGNORE INTO projects (id,organization_id,name) VALUES (?,?,?)', projectId, organizationId, 'Worker compliance project');
  await db.run('INSERT OR IGNORE INTO workspaces (id,name,path,language,organization_id,project_id) VALUES (?,?,?,?,?,?)', workspaceId, `Isolated worker compliance ${workspaceId}`, workspaceRoot, 'TypeScript', organizationId, projectId);
  await db.run(`INSERT OR IGNORE INTO agents (id,name,role,status,agent_type,execution_mode,workspace_id,cognitive_budget,cognitive_baseline_budget,model_tier,language,isolation_mode,parent_agent_id,metadata_json) VALUES (?,?,?,'idle',?,'orchestrator',?,100000,100000,'Local','TypeScript','Branch',NULL,'{}')`, parentId, 'Compliance orchestrator', 'compliance', 'GenOS', workspaceId);
  const contract = contracts.buildStrategyContract({ mission: 'Run one isolated worker kind compliance mission.', allowPrototype: true });
  if (!(await contracts.getLatestContract(db, parentId, workspaceId))) await contracts.saveContract(db, { agentId: parentId, workspaceId, contract, createdBy: 'worker-compliance-harness' });
}
async function missionFor(context) {
  const { db, parentId, workspaceId, kind, model, scenario } = context;
  const codeMission = boundedCode.enabled(kind);
  const modelBudgetScope = codeMission ? await boundedCode.bindModelBudget(context) : null;
  const strategy = await contracts.getLatestContract(db, parentId, workspaceId);
  const assignment = { workerKind: kind, role: boundedCode.workerRole(kind), label: `compliance-${kind}`,
    hypothesis: `Produce the contract artifact from ${scenario.sourceRef}.`, capabilities: [], modelTier: 'Local',
    specialtyNiche: 'scheduling', nicheDomain: 'scheduling',
    hostContractId: 'compliance-host', hostCapabilities: structuredWorkers.hostCapabilities(kind),
    methodContract: codeMission ? null : complianceMethod(kind) };
  const created = await fleet.createAutonomousWorkers(db, { id: parentId, agent_type: 'GenOS' }, {
    plan: { strategyContract: { primary: strategy.contract.selected_strategy.primary }, tokenPolicy: { total: 5000, workerShare: 0.6, orchestratorReserve: 0.4, allocation: 'fixed' }, dispatchWorkers: [assignment] },
    mission: { prompt: codeMission ? boundedCode.prompt(scenario.sourceRef)
      : `${scenario.prompt} Fixture data: ${JSON.stringify(scenario.receipt)}. Source evidence: ${scenario.sourceRef} Analyze this synthetic fixture only. Do not access or modify repository files.`, workspaceRoot: context.rootWorkspace, workspaceProvisioned: codeMission, writeLease: codeMission, capsuleRoot: process.env.GENOS_CAPSULE_ROOT, modelBudgetScope, codeVerificationContract: codeMission ? boundedCode.verificationContract() : null, ...dossierCases.missionOptions(kind), executionPolicy: boundedCode.executionPolicy(kind), executionBudget: { tokens: 5000, costUsd: codeMission ? 0.2 : undefined, events: 40, latencyMs: Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000 }, timeoutMs: Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000, executor: 'local', localRuntime: true, localModel: model }
  });
  return created[0];
}
function complianceMethod(kind) {
  const local = localComplianceMethod(kind);
  if (local) return local;
  if (kind === 'procedural_executor') return require('./helpers/workerComplianceProceduralMethod.cjs').select();
  if (kind === 'formal_worker' && process.env.GENOS_COMPLIANCE_LEAN_VERSION) {
    return { version: 1, methodId: 'formal_proof', parameters: {
      claim: '2 + 2 = 4', toolchainVersion: process.env.GENOS_COMPLIANCE_LEAN_VERSION
    } };
  }
  if (kind === 'formal_worker') return { version: 1, methodId: 'check_arithmetic', parameters: { claim: '2 + 2 = 4' } };
  if (kind === 'verifier_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_VERIFIER === '1') {
    const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
    const candidateReceipt = require('../src/services/agents/deterministicWorkerProcedures').runProcedure(procedure).receipt;
    return { version: 1, methodId: 'verify_procedure', parameters: { procedure, candidateReceipt } };
  }
  return subOrchestrator.enabled(kind) ? subOrchestrator.method()
    : structuredWorkers.method(kind) || additionalComplianceMethod(kind);
}
function localComplianceMethod(kind) {
  const dossierMethod = dossierCases.method(kind);
  if (dossierMethod) return dossierMethod;
  if (kind === 'bounded_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED === '1') {
    return { version: 1, methodId: 'scoped_procedure', parameters: {
      procedure: { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } }
    } };
  }
  if (kind === 'forensic_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_FORENSIC === '1') {
    return forensicComplianceMethod();
  }
  if (kind === 'teaching_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_TEACHING === '1') {
    return { version: 1, methodId: 'teach_subset_sum', parameters: {
      procedure: { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } },
      learnerIndices: [0, 2], prerequisites: ['Integer addition'] } };
  }
  if (kind === 'scout_cell' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_SCOUT === '1') {
    return { version: 1, methodId: 'scan_literal', parameters: {
      sources: [{ sourceRef: 'corpus://compliance/log-1', text: 'status=ok timeout=30' }],
      terms: ['timeout'] } };
  }
  return null;
}
function forensicComplianceMethod() {
  return { version: 1, methodId: 'trace_declared_causes', parameters: { events: [
    { id: 'deploy', occurredAt: '2026-10-04T10:00:00Z', sourceRef: 'incident://compliance/deploy' },
    { id: 'alert', occurredAt: '2026-10-04T10:01:00Z', sourceRef: 'incident://compliance/alert',
      causedBy: { eventId: 'deploy', receiptRef: 'incident://compliance/causation' } }
  ] } };
}
function additionalComplianceMethod(kind) {
  if (kind === 'red_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_RED === '1') {
    const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
    const receipt = require('../src/services/agents/deterministicWorkerProcedures').runProcedure(procedure).receipt;
    const candidateReceipt = { ...receipt, result: { found: false } };
    return { version: 1, methodId: 'falsify_procedure', parameters: { procedure, candidateReceipt } };
  }
  if (kind === 'experimental_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_EXPERIMENT === '1') {
    return { version: 1, methodId: 'measure_lpt', parameters: {
      jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }],
      machines: 2, threshold: 7
    } };
  }
  if (kind === 'synthesis_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_SYNTHESIS === '1') {
    return { version: 1, methodId: 'synthesize_claims', parameters: { sources: [
      { sourceRef: 'source://compliance/synthesis/a', claim: 'Release is safe.', position: 'yes' },
      { sourceRef: 'source://compliance/synthesis/b', claim: 'Release is safe.', position: 'no' }
    ] } };
  }
  if (kind === 'resident_daemon' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_MONITOR === '1') {
    return { version: 1, methodId: 'monitor_samples', parameters: {
      territoryId: 'compliance-sensor', threshold: 10, samples: [
        { value: 4, observedAt: '2026-10-04T10:00:00Z', sourceRef: 'sensor://compliance/1' },
        { value: 12, observedAt: '2026-10-04T10:01:00Z', sourceRef: 'sensor://compliance/2' }
      ] } };
  }
  return undefined;
}
async function validateMission(context) {
  const { db, worker, metadata, parentId, kind, scenario, execution } = context;
  const { agent, report, eventPayload, eventType } = await readWorkerOutcome(db, worker.agentId);
  const run = await readExecutionRun(db, execution);
  const oracle = await inspectOracle(db, execution, worker.agentId);
  const acceptedOracle = oracleAccepted(execution, oracle);
  const artifactValidationError = validateArtifactForMission(report, worker.agentId, metadata.workerContract);
  const artifactValidated = Boolean(report) && artifactValidationError === null;
  const expected = kinds.kindDefinition(kind).artifact;
  const artifact = report?.workerArtifact?.type || null;
  const correctReference = correctMissionReference(kind, report, scenario);
  const refusalsValidated = validateExpectedRefusals(kind, metadata.workerContract);
  const persistedContract = metadata.workerKind === kind && metadata.workerContract.identity.workerKind === kind;
  const parentBound = metadata.workerContract.identity.parentId === parentId;
  const runtimeStarted = await wasRuntimeStarted(db, worker.agentId, execution);
  const executionRunBound = Boolean(execution?.executionRun?.id)
    && eventPayload.executionRunId === execution.executionRun.id;
  const nativeExecution = execution?.deterministic === true;
  const passed = successfulOutcome({ run, eventType, report, artifact, expected, artifactValidated, nativeExecution,
    oracleAccepted: acceptedOracle,
    correctReference, refusalsValidated, persistedContract, parentBound, runtimeStarted,
    executionRunBound });
  const errorCode = executionErrorCode(execution);
  return { runId: process.env.GENOS_COMPLIANCE_RUN_ID, kind, workerId: worker.agentId, persistedContract, parentBound, runtimeStarted, executionRunBound, status: run?.status || agent.status, agentStatus: agent.status, terminalEvent: eventType, outcome: report?.outcome || null, expectedArtifact: expected, artifact, artifactValidated, nativeExecution, oracleAccepted: acceptedOracle, oracle, sourceEvidenceValidated: correctReference, refusalsValidated, workerArtifactContent: workerArtifactContent(kind, report), stageTimings: eventPayload.stageTimings || {}, proposalTests: eventPayload.proposalTests || [], artifactDiagnostics: eventPayload.workerArtifactDiagnostics || null, passed, errorCode, error: missionError({ passed, artifactValidationError, execution, report, eventPayload }) };
}
function workerArtifactContent(kind, report) {
  return kind === 'sub_orchestrator' ? report?.workerArtifact?.content || null : undefined;
}
function correctMissionReference(kind, report, scenario) {
  if (boundedCode.enabled(kind)) return boundedCode.validEvidence(report?.workerArtifact?.content);
  const observed = observedMissionReference(kind, report?.workerArtifact?.content);
  if (observed !== null) return observed;
  const specialized = specializedMissionReference(kind, report);
  if (specialized !== null) return specialized;
  if (structuredWorkers.enabled(kind)) return structuredWorkers.references(kind, report, scenario);
  const deterministic = deterministicMissionReference({ kind, report, solverReference });
  if (deterministic !== null) return deterministic;
  return hasFixtureReference(report, scenario.sourceRef);
}

function observedMissionReference(kind, content) {
  const dossierReference = dossierCases.reference(kind, content);
  if (dossierReference !== null) return dossierReference;
  if (kind === 'teaching_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_TEACHING === '1') {
    return content?.transferCheck?.passed === true
      && solverReference(content?.teachingReceipt?.id);
  }
  if (kind === 'scout_cell' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_SCOUT === '1') {
    return content?.observations?.[0]?.offset === 10
      && solverReference(content?.scoutReceipt?.id);
  }
  if (kind === 'forensic_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_FORENSIC === '1') {
    return forensicMissionReference(content);
  }
  return null;
}

function specializedMissionReference(kind, report) {
  const content = report?.workerArtifact?.content;
  if (subOrchestrator.enabled(kind)) return subOrchestrator.references(content);
  if (kind === 'red_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_RED === '1') {
    return redMissionReference(content);
  }
  if (kind === 'experimental_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_EXPERIMENT === '1') {
    return experimentMissionReference(content);
  }
  if (kind === 'synthesis_worker' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_SYNTHESIS === '1') {
    return synthesisMissionReference(content);
  }
  if (kind === 'resident_daemon' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_MONITOR === '1') {
    return monitorMissionReference(content);
  }
  return null;
}

function forensicMissionReference(content) {
  return content?.causalChain?.[0]?.from === 'deploy'
    && content?.causalChain?.[0]?.to === 'alert'
    && solverReference(content?.forensicReceipt?.id);
}

function redMissionReference(content) {
  return content?.verdict === 'reject' && content?.counterexamples?.length > 0
    && solverReference(content?.expectedReceipt?.id);
}

function experimentMissionReference(content) {
  return content?.measurements?.[0]?.value === 7 && solverReference(content?.procedureReceipt?.id);
}

function synthesisMissionReference(content) {
  return content?.disagreements?.[0]?.claim === 'Release is safe.'
    && content?.sources?.length === 2 && solverReference(content?.synthesisReceipt?.id);
}

function monitorMissionReference(content) {
  return content?.anomalies?.[0]?.value === 12
    && content?.territoryReport?.sourceRefs?.length === 2
    && solverReference(content?.monitorReceipt?.id);
}

function solverReference(id) {
  return /^solver:\/\/sha256:[a-f0-9]{64}$/.test(id || '');
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
  const row = await db.get("SELECT event_type,payload_json FROM telemetry_events WHERE agent_id = ? AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED','AGENT_FAILED','AGENT_HALTED') ORDER BY id DESC LIMIT 1", workerId);
  const event = row ? JSON.parse(row.payload_json) : null;
  return { agent, report: event ? extractEvidenceReport(event) : null,
    eventPayload: event?.payload || event || {}, eventType: row?.event_type || null };
}

function hasFixtureReference(report, sourceRef) {
  return includesReference(report?.claims, sourceRef) || includesReference(report?.workerArtifact, sourceRef);
}
async function wasRuntimeStarted(db, workerId, execution) {
  if (execution?.started === true) return true;
  const nativeStart = await db.get("SELECT 1 AS started FROM telemetry_events WHERE agent_id = ? AND event_type = 'DETERMINISTIC_WORKER_STARTED' LIMIT 1", workerId);
  return nativeStart?.started === 1;
}

async function executeAndProbe(context) {
  const native = Boolean(perceptionProbe.INPUT)
    && ['procedural_executor', 'formal_worker'].includes(context.kind);
  const pendingExecution = executeWorkerMission(context);
  if (native) {
    const perception = await perceptionProbe.run(context, null);
    const execution = await pendingExecution;
    return { execution, perception: bindPerception(perception, execution) };
  }
  const execution = await pendingExecution;
  const perception = await perceptionProbe.run(context, execution);
  return { execution, perception: bindPerception(perception, execution) };
}

function bindPerception(perception, execution) {
  if (!perception) return null;
  return { ...perception, executionRunBound: Boolean(execution?.executionRun?.id)
    && perception.observedRunId === execution.executionRun.id };
}

async function runOne({ runId, kind }) {
  const model = process.env.GENOS_LOCAL_MODEL;
  assertModelAvailable({ kind, model, hasNativeMethod: (workerKind) =>
    hasNativeMethod(workerKind, complianceMethod(workerKind)?.methodId) });
  const rootWorkspace = path.join(process.env.GENOS_WORKSPACE_ROOT, kind);
  fs.mkdirSync(rootWorkspace, { recursive: true });
  const workspaceId = `compliance-workspace-${runId}-${kind}`;
  const parentId = `compliance-parent-${runId}-${kind}`;
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  let context = null;
  let execution = null;
  try {
    context = await createWorkerContext({ db, parentId, workspaceId, rootWorkspace, kind, model, runId });
    perceptionProbe.prepare(context);
    const observed = await executeAndProbe(context);
    execution = observed.execution;
    const perception = observed.perception;
    if (perception) perception.runtimeSettled = await perceptionProbe.settle(context.worker.agentId);
    const result = await validateMission({ ...context, db, execution });
    result.executionRunId = execution?.executionRun?.id || null;
    if (boundedCode.enabled(kind)) {
      await boundedCode.attachCompletion({ db, workerId: context.worker.agentId,
        workspaceRoot: context.worker.workspaceRoot || context.rootWorkspace,
        missionResult: result, workerReport: await readWorkerOutcome(db, context.worker.agentId).then((outcome) => outcome.report) });
    }
    result.perception = perception;
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!perceptionProbe.INPUT && !result.passed) process.exitCode = 1;
  } catch (error) {
    const result = failedMissionResult({ runId, kind, parentId, error, context, execution });
    saveResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!perceptionProbe.INPUT) process.exitCode = 1;
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
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
    runtimeStarted: execution?.started === true,
    executionRunBound: false,
    status: execution ? 'execution_failed' : 'not_started',
    outcome: null,
    expectedArtifact: kinds.kindDefinition(kind).artifact,
    artifact: null,
    artifactValidated: false,
    nativeExecution: execution?.deterministic === true,
    oracleAccepted: false,
    oracle: { status: 'not_evaluated' },
    sourceEvidenceValidated: false,
    refusalsValidated: context ? validateExpectedRefusals(kind, context.metadata.workerContract) : false,
    stageTimings: {},
    artifactDiagnostics: null,
    passed: false,
    errorCode: error.code || null,
    error: error.message
  };
}

async function createWorkerContext(options) {
  const { db, parentId, workspaceId, rootWorkspace, kind, model, runId } = options;
  await seedParent({ db, parentId, workspaceId, workspaceRoot: rootWorkspace });
  const scenario = workerComplianceScenario(kind);
  const worker = await missionFor({ db, parentId, workspaceId, rootWorkspace, kind, model, scenario });
  dossierCases.prepareWorker(kind, worker, rootWorkspace);
  if (boundedCode.enabled(kind)) boundedCode.prepare(worker.workspaceRoot || rootWorkspace);
  const row = await db.get('SELECT metadata_json FROM agents WHERE id = ?', worker.agentId);
  const metadata = JSON.parse(row.metadata_json);
  if (metadata.workerKind !== kind || metadata.workerContract?.identity?.workerKind !== kind) throw new Error(`Persistent worker contract mismatch for ${kind}.`);
  if (!inside(process.env.GENOS_CAPSULE_ROOT, worker.workspaceRoot || rootWorkspace)) throw new Error(`Worker workspace escaped isolated capsule root: ${worker.workspaceRoot}`);
  const missionId = `compliance-mission-${runId}-${kind}`;
  await db.run("INSERT INTO missions (mission_id, objective, status, orchestrator_agent_id) VALUES (?, ?, 'active', ?)", missionId, `Compliance mission for ${kind}`, parentId);
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', missionId, worker.agentId, kind);
  return { db, runId, worker, metadata, parentId, workspaceId, rootWorkspace, kind, model, scenario, missionId };
}

function executionErrorCode(execution) {
  return execution?.errorCode || execution?.code;
}
async function executeWorkerMission(context) {
  const { worker, metadata, parentId, workspaceId, rootWorkspace, kind, model, missionId } = context;
  const timeoutMs = Number(process.env.GENOS_COMPLIANCE_LATENCY_MS) || 180000;
  try {
    const nativeObservation = ['procedural_executor', 'formal_worker'].includes(kind);
    return await runtime.startMission({ agentId: worker.agentId, missionId, orchestratorAgentId: parentId, modelBudgetScope: worker.modelBudgetScope, role: worker.role, workerKind: kind, workerContract: metadata.workerContract, methodContract: worker.methodContract, prompt: worker.prompt, workspaceId: worker.workspaceId || workspaceId, workspaceRoot: worker.workspaceRoot || rootWorkspace, workspaceProvisioned: true, executor: 'local', localRuntime: true, localModel: model, modelTier: 'Local', timeoutMs, executionBudget: { ...worker.executionBudget, tokens: 5000, events: 40, latencyMs: timeoutMs }, executionPolicy: { ...boundedCode.executionPolicy(kind), silentUpdates: true }, toolLease: worker.toolLease || [], silentUpdates: true, ...(perceptionProbe.INPUT ? { continuousExecution: { mode: nativeObservation ? 'observe' : 'control', files: [perceptionProbe.INPUT], intervalMs: 100, ...(nativeObservation ? { observationWindowMs: 2500 } : {}) } } : {}) });
  } catch (error) { return { error: error.message, errorCode: error.code || null }; }
}

module.exports = { runOne };
