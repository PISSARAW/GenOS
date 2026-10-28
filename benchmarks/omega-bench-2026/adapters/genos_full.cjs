'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { execFileSync } = require('node:child_process');
const traces = require('../src/run-trace.cjs');
const { createRunMeasurement } = require('../src/measure-adapter-run.cjs');
process.env.GENOS_ADMIN_PASSWORD ||= 'omega-bench-local-fixture';

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
const REPETITIONS = 3;
const reference = require('./json_reference.cjs');
const optimized = require('./gcir_optimized.cjs');
const planner = require(path.join(REPO, 'backend/src/services/morphogenesis/morphogenesisPlannerService'));
const collective = require(path.join(REPO, 'backend/src/services/collectiveStateService'));
const morphogenesis = require(path.join(REPO, 'backend/src/services/morphogenesis/morphogenesisGitService'));
const physiology = require(path.join(REPO, 'backend/src/services/biome/variants/variantSessionOperations'));
const { createRuntime } = require(path.join(REPO, 'backend/src/services/cognitiveOmegaRuntimeService'));
const compiler = require(path.join(REPO, 'backend/src/services/cognitiveOmegaCompiler'));
const interop = require(path.join(REPO, 'backend/src/services/cognitiveOmegaInteropService'));

function configureAuthority() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const keyId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = JSON.stringify({ [keyId]: raw.toString('hex') });
}

async function createHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-bench-d-'));
  const dbPath = path.join(root, 'genos.db');
  const { getDatabase } = require(path.join(REPO, 'backend/src/db'));
  const db = await getDatabase(dbPath);
  await db.run("INSERT INTO organizations(id,name) VALUES ('omega-bench-org','OMEGA-BENCH')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES ('omega-bench-project','omega-bench-org','OMEGA-BENCH')");
  return { db, root, workspaceRoot: path.join(root, 'workspaces') };
}

function actualTopology(topology) {
  return topology === 'a-team' ? 'a_team' : topology;
}

function missionState(row, missionId, agentId) {
  return collective.deserializeState({
    mission: { id: row.input.mission_id, openObligations: row.input.open_obligations,
      effectAuthority: { scope: missionId } },
    agents: { [agentId]: { id: agentId, status: 'idle', lease: ['read'] } },
    topologyState: { organization: actualTopology(row.input.from_topology),
      topology: actualTopology(row.input.from_topology), activeSubgraphs: [] },
    budgets: { total: 100, allocated: 20, remaining: 80, perAgent: { [agentId]: 20 } }
  });
}

async function seedTransitionAgent(harness, row, repetition) {
  const key = `${row.scenario_id}-r${repetition}`;
  const agentId = `omega-${key}`;
  const workspaceId = `ws-${key}`;
  const workspacePath = path.join(harness.workspaceRoot, workspaceId);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'state.json'), JSON.stringify(row.input));
  await harness.db.run(`INSERT INTO workspaces(id,name,path,organization_id,project_id)
    VALUES (?,?,?,'omega-bench-org','omega-bench-project')`, workspaceId, workspaceId, workspacePath);
  await harness.db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id)
    VALUES (?,?,'orchestrator','idle','orchestrator',?)`, agentId, agentId, workspaceId);
  return { agentId, missionId: `mission-${key}` };
}

function transitionPlan(row, missionId) {
  const generated = planner.planMorphogenesis({
    proposedTopology: actualTopology(row.input.to_topology),
    currentState: { topology: actualTopology(row.input.from_topology), agents: new Map(), currentMorphologyVersion: 0 },
    reason: 'OMEGA-BENCH E10 topology transition', budget: { tokens: 1000 }, missionId
  });
  const validation = planner.validatePlan({ plan: generated });
  if (!validation.valid || generated.selectedTopology !== actualTopology(row.input.to_topology)) {
    throw new Error(`morphogenesis_plan_invalid:${validation.errors.join(';')}`);
  }
  return { generated, plan: { ...generated, id: `plan-${missionId}`, missionId,
    actions: [], targetTopology: generated.selectedTopology,
    expectedGain: generated.expectedBenefit || 0.7,
    expectedRisk: generated.expectedCost?.risk ?? 0.2 } };
}

function requestFor(agentId, missionId) {
  return { user: { username: 'omega-bench-runner' },
    tenant: { organizationId: 'omega-bench-org', projectId: 'omega-bench-project' },
    agentId, missionId };
}

async function executeMorphogenesis(row, repetition, harness) {
  const identity = await seedTransitionAgent(harness, row, repetition);
  const state = missionState(row, identity.missionId, identity.agentId);
  const beforeMission = structuredClone(state.mission);
  const { generated, plan } = transitionPlan(row, identity.missionId);
  const versioned = await morphogenesis.executeVersionedTransition({
    plan, collectiveState: state, db: harness.db, req: requestFor(identity.agentId, identity.missionId),
    agentId: identity.agentId, missionId: identity.missionId
  });
  const observed = await observeTransition(harness.db, versioned.receipt);
  return transitionResult({ row, generated, versioned, beforeMission, observed });
}

async function observeTransition(db, receipt) {
  const stored = await db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
  const persisted = stored ? collective.deserializeState(stored.value) : null;
  const snapshot = receipt.durableSnapshot
    ? await require(path.join(REPO, 'backend/src/services/morphogenesis/morphogenesisTransitionSnapshotService'))
      .load({ db, id: receipt.durableSnapshot.id }) : null;
  return { persisted, snapshot };
}

function transitionResult(input) {
  const { row, generated, versioned, beforeMission, observed } = input;
  const receipt = versioned.receipt;
  const persisted = observed.persisted;
  const target = actualTopology(row.input.to_topology);
  const topology = persisted?.topologyState.topology;
  const obligationsPreserved = isDeepStrictEqual(persisted?.mission, beforeMission)
    && persisted?.mission?.id === row.input.mission_id;
  const committed = receipt.committed === true && versioned.commit?.id
    && observed.snapshot?.row.status === 'committed';
  const violations = transitionViolations({ receipt, committed, topology, target, obligationsPreserved });
  return { answer: { active_topology: topology === target ? row.input.to_topology : topology,
    mission_id: obligationsPreserved ? persisted.mission.id : null,
    preserved_obligations: persisted?.mission?.openObligations || [], violations },
  metrics: { service: 'planMorphogenesis+executeVersionedTransition',
    plan_valid: generated.selectedTopology === target, rust_authority: receipt.rustAuthority?.decision || null,
    transition_committed: Boolean(committed), agent_git_commit_id: versioned.commit?.id || null,
    snapshot_status: observed.snapshot?.row.status || null, obligations_preserved: obligationsPreserved },
  violations };
}

function transitionViolations(input) {
  const { receipt, committed, topology, target, obligationsPreserved } = input;
  const missingCommit = receipt.errors?.[0] || receipt.code || 'transition_not_committed';
  return [!committed && missingCommit, topology !== target && 'target_topology_not_persisted',
    !obligationsPreserved && 'mission_invariants_not_preserved'].filter(Boolean);
}

function executePhysiology(row) {
  const populations = row.input.demands.map((demand) => ({ id: demand.agent,
    demand: demand.minimum, priority: demand.priority }));
  const allocation = physiology.allocateResources(populations, {
    totalBudget: row.input.resource_budget, minimumPerPopulation: 0
  });
  const result = Object.fromEntries(allocation.allocations.map((item) => [item.id, item.budget]));
  const allocated = Object.values(result).reduce((sum, value) => sum + value, 0);
  return { answer: { allocation: result, allocated_total: allocated,
    unallocated: row.input.resource_budget - allocated },
  metrics: { service: 'biome.allocateResources', budget_conserved: allocation.conserved,
    total_budget: allocation.totalBudget, priority_weights: populations.map((item) => item.priority) },
  violations: allocation.conserved ? [] : ['resource_budget_not_conserved'] };
}

async function closeHarness(harness) {
  const { closeDatabase } = require(path.join(REPO, 'backend/src/db'));
  await closeDatabase();
  fs.rmSync(harness.root, { recursive: true, force: true });
  delete process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
  delete process.env.GENOS_CLI_AUTHORITY_TRUST_JSON;
}

async function executeRowD(row, repetition, harness) {
  if (['E10', 'E11'].includes(row.experiment_id)) {
    return executeGcirGenosService(row, repetition, harness);
  }
  return optimized.executeRow(row);
}

function operationsFor(row) {
  return [{ id: 'read', kind: 'READ', reference: 'bench/input', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'bench/input', dependsOn: ['read'], state: 'open' },
    { id: 'call', kind: 'CALL', reference: `bench/${row.experiment_id}`,
      dependsOn: ['select'], state: 'open' }];
}

function envelopeFor(row, operations) {
  return { schema: interop.SCHEMA, version: 1, id: row.scenario_id, operations,
    policy: { read: ['bench/input'], select: ['bench/input'],
      call: [`bench/${row.experiment_id}`] }, payload: row.input };
}

function policyFor(row) {
  return { read: ['bench/input'], select: ['bench/input'],
    call: [`bench/${row.experiment_id}`] };
}

async function executeGcirGenosService(row, repetition, harness) {
  const operations = operationsFor(row);
  if (!interop.validate(envelopeFor(row, operations)).valid) {
    throw new Error('genos_service_gcir_envelope_invalid');
  }
  const compiled = compiler.compile({ operations, targets: ['call'],
    model: 'deterministic-benchmark-handler' });
  if (compiled.status !== 'ready') throw new Error(`compile_${compiled.status}`);
  return invokeGcirService({ row, repetition, harness, operations: compiled.slice.nodes });
}

async function invokeGcirService(input) {
  const { row, repetition, harness, operations } = input;
  let serviceResult;
  const runtime = createRuntime();
  runtime.registerReader('bench/input', async () => row.input);
  runtime.registerTool(`bench/${row.experiment_id}`, async ({ input: payload }) => {
    const task = { ...row, input: payload };
    serviceResult = row.experiment_id === 'E10'
      ? await executeMorphogenesis(task, repetition, harness) : executePhysiology(task);
    serviceResult.answer = { ...serviceResult.answer,
      mission_execution: reference.executeMissionWorkload(row.input.mission_workload) };
    return { value: serviceResult.answer };
  });
  const result = await runtime.execute({ operations, policy: policyFor(row), allowEmit: true });
  if (result.status !== 'emitted' || result.values.call === undefined || !serviceResult) {
    throw new Error(`gcir_runtime_${result.reason || result.status}`);
  }
  return { ...serviceResult, metrics: { ...serviceResult.metrics,
    gcir_static_validation: 'passed', gcir_runtime: 'emitted',
    gcir_operations: operations.length } };
}

async function timedRow(row, repetition, harness) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'D', repetition }, row.input);
  const input = JSON.stringify(row.input);
  const measurement = createRunMeasurement();
  let output;
  let status = 'completed';
  try {
    output = await executeRowD(row, repetition, harness);
    if (output.violations?.length) status = 'failed';
  } catch (error) {
    status = 'failed';
    output = { answer: null, metrics: { adapter_error: error.message }, violations: [error.message] };
  }
  const latency = measurement.elapsedMs();
  const answer = output.answer;
  traces.phase(trace, row.experiment_id === 'E10' ? 'genos_morphogenesis_and_gcir_completed'
    : row.experiment_id === 'E11' ? 'genos_physiology_and_gcir_completed' : 'gcir_runtime_completed');
  traces.finish(trace, answer, status);
  const result = { scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'D', repetition, status, answer,
    metrics: output.metrics, violations: output.violations || [],
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(input),
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null } };
  return result;
}

function manifestFor(input) {
  const { rows, outputPath, repetitions, pilot, partialScope } = input;
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  return { protocol: 'OMEGA-BENCH-2026', condition_id: 'D',
    status: pilot ? 'exploratory_pilot_not_qualified'
      : partialScope ? 'scoped_gcir_genos_service_refresh'
      : 'G-CIR runtime wrapping GenOS morphogenesis on E10 and physiology on E11; C runtime elsewhere',
    scenarios: rows.length, repetitions, runs: rows.length * repetitions,
    scope: [...new Set(rows.map((row) => row.experiment_id))],
    repository_revision: revision,
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(datasetManifest)).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    latency_scope: 'decoded_input_object_to_semantic_answer; trace events excluded',
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

function selectPilotRows(rows, selection) {
  if (!selection) return rows;
  const scenarioId = /^E\d{2}-\d{3}$/.test(selection) ? selection : null;
  const experiment = scenarioId ? scenarioId.slice(0, 3) : selection;
  const matching = rows.filter((row) => row.experiment_id === experiment
    && (!scenarioId || row.scenario_id === scenarioId));
  return scenarioId ? matching : matching.slice(0, 1);
}

function runOptions(args) {
  const pilotSelection = args[2] === '--pilot' ? args[3] : null;
  const scopeSelection = args[2] === '--scope' ? args[3]?.split(',') : null;
  const pilotExperiment = pilotSelection?.slice(0, 3) || null;
  const experiments = scopeSelection || Array.from({ length: 12 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
  const outputIndex = pilotExperiment || scopeSelection ? 4 : 2;
  const defaultName = pilotExperiment ? `D-pilot-${pilotExperiment}.jsonl` : 'D-genos-full.jsonl';
  return { pilotSelection, scopeSelection, pilotExperiment, experiments,
    repetitions: pilotExperiment ? 1 : REPETITIONS,
    outputPath: args[outputIndex] || path.join(ROOT, 'results', defaultName) };
}

function rowsForRun(options) {
  const rows = options.experiments.flatMap((experiment) => reference.readRows(
    path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
  return selectPilotRows(rows, options.pilotSelection);
}

function persistResults(rows, results, options) {
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${results.map((item) => JSON.stringify(item)).join('\n')}\n`);
  const traceManifest = traces.writeSidecar(options.outputPath, 'D');
  fs.writeFileSync(options.outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify({ ...manifestFor({ rows, outputPath: options.outputPath,
      repetitions: options.repetitions, pilot: Boolean(options.pilotExperiment),
      partialScope: Boolean(options.scopeSelection) }), ...traceManifest }, null, 2)}\n`);
}

async function main() {
  configureAuthority();
  const harness = await createHarness();
  const options = runOptions(process.argv);
  const rows = rowsForRun(options);
  const results = [];
  try {
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      for (const row of rows) results.push(await timedRow(row, repetition, harness));
    }
    persistResults(rows, results, options);
    process.stdout.write(`Condition D complete: ${results.length} GenOS runs across ${rows.length} cases.\n`);
  } finally {
    await closeHarness(harness);
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { configureAuthority, createHarness, closeHarness, correctTopology: actualTopology,
  executeGcirGenosService, executeMorphogenesis, executePhysiology, transitionPlan };
