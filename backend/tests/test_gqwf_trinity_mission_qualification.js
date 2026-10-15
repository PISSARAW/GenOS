'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = crypto.randomBytes(32).toString('hex');

const database = require('../src/db');
const missionIdentity = require('../src/services/missionIdentityService');
const strategy = require('../src/services/strategyExecutionService');
const strategies = require('../src/services/strategyContractService');
const missions = require('../src/services/agentRuntimeAdapter/missionWorkers');
const evidenceBarrier = require('../src/services/workerEvidenceBarrier');
const comparativeBarrier = require('../src/services/trinityComparativeBarrier');
const telemetry = require('../src/services/telemetryObserver');

const workerAssignments = {
  basic_implementation: { methodContract: scopedMethod() },
  interview_plan_implementation: { specialtyNiche: 'planned_world', methodContract: nicheMethod() },
  self_correcting_implementation: { methodContract: adaptiveMethod() }
};

function problem() {
  return { version: 1, methodId: 'lpt', parameters: {
    jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2
  } };
}

function scopedMethod() {
  return { version: 1, methodId: 'scoped_procedure', parameters: { procedure: problem() } };
}

function nicheMethod() {
  return { version: 1, methodId: 'niche_procedure', parameters: { niche: 'planned_world', procedure: problem() } };
}

function adaptiveMethod() {
  return { version: 1, methodId: 'adapt_procedure', parameters: { trials: [
    { strategy: 'controlled_probe', procedure: problem() },
    { strategy: 'causal_bisection', procedure: problem() },
    { strategy: 'controlled_probe', procedure: problem() }
  ] } };
}

function claimPlans(source) {
  return [
    `Scoped procedure 'lpt' completed in '${source}'.`,
    "Procedure executed within declared niche 'planned_world'.",
    '3 bounded strategy trials executed; best observed makespan 7.'
  ].map((claim) => ({ claim, commandIds: ['npm-test'] }));
}

async function createWorkspace(db, root, answer) {
  const source = path.join(root, 'workspace');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'answer.txt'), answer);
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ private: true,
    scripts: { test: 'node test.js' } }));
  await fs.writeFile(path.join(source, 'test.js'), "const fs=require('node:fs');if(fs.readFileSync('answer.txt','utf8')!=='42\\n')process.exit(1);\n");
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'gqwf-qual-ws', 'GQWF qualification', source);
  await db.run(`INSERT INTO agents
    (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, language, isolation_mode,
     cognitive_budget, cognitive_baseline_budget, metadata_json)
    VALUES ('gqwf-qual-agent', 'GQWF qualification', 'orchestrator', 'idle', 'GenOS', 'orchestrator', ?,
      'Local', 'JavaScript', 'Branch', 100000, 100000, '{}')`, 'gqwf-qual-ws');
  const contract = strategies.buildStrategyContract({ mission: 'Execute a bounded comparative mission.', allowPrototype: true });
  contract.execution_pipeline = ['deterministic_execution'];
  contract.promotion.require_independent_verification = false;
  contract.promotion.require_epistemic_assurance = false;
  await strategies.saveContract(db, { agentId: 'gqwf-qual-agent', workspaceId: 'gqwf-qual-ws',
    contract, createdBy: 'gqwf-trinity-qualification' });
  return source;
}

function missionInput(source, missionId) {
  return { missionId, prompt: 'Run Trinity: solve the LPT scheduling fixture and verify the checked workspace.',
    workspaceRoot: source, autonomousOrchestration: true, executionBudget: {
      tokens: 12000, workerShare: 0.75, orchestratorReserve: 0.25, events: 180, latencyMs: 120000
    }, executionPolicy: { gqwfV2: true, requestedWorkers: 3, workerFanoutLimit: 3, allowFileEdits: true },
    workerAssignments, trinityVariantId: 'controlled', trinityIntegrationChecks: ['npm-test'],
    trinityClaimVerificationChecks: claimPlans(source), executor: 'local', localRuntime: true, silentUpdates: true };
}

function autonomyPlan(input) {
  const service = require('../src/services/trinityService');
  const variants = require('../src/services/trinityVariantService');
  const kinds = require('../src/services/topologyWorkerKindService');
  const differentiation = require('../src/services/trinityDifferentiationService');
  const analysis = service.analyzeMission(input.prompt);
  const selection = variants.selectForMission(input.prompt, { variantId: input.trinityVariantId });
  const members = kinds.applyTopologyWorkerKinds('trinity', differentiation.differentiate(analysis.members, {
    goal: input.prompt, domain: analysis.domain, design: selection.experimentalDesign
  }), input.workerAssignments);
  const design = service.designHypotheses(input.prompt, {
    integrationChecks: input.trinityIntegrationChecks,
    claimVerificationChecks: input.trinityClaimVerificationChecks
  });
  design.variantSelection = selection;
  return { trinity: { ...analysis, activated: true, missionId: null, experimentId: null,
    variantSelection: selection, members, hypothesisDesign: design, threshold: 0.70 },
    tokenPolicy: { total: 12000, workerShare: 0.75, orchestratorReserve: 0.25, allocation: 'fixed' },
    workers: members, dispatchWorkers: members };
}

async function runMission(db, source, missionId) {
  const input = missionInput(source, missionId);
  const row = await db.get('SELECT * FROM agents WHERE id = ?', 'gqwf-qual-agent');
  const contractRecord = await strategies.getLatestContract(db, 'gqwf-qual-agent', 'gqwf-qual-ws');
  await missionIdentity.create(db, { missionId, objective: input.prompt, orchestratorAgentId: row.id });
  const run = await strategy.createExecutionRun(db, { agentId: row.id, missionId,
    budget: input.executionBudget, contractRecord });
  const ctx = { db, agentId: row.id, dispatchedAgent: row, normalizedMission: input,
    autonomyPlan: autonomyPlan(input), contractRecord, executionRun: run, workspaceRoot: source,
    silentUpdates: true };
  const workers = await missions.orchestrateAutonomousWorkers(ctx);
  assert.equal(workers.length, 3, 'the mission dispatcher must create all three Trinity workers');
  for (const worker of workers) fsSync.realpathSync(worker.workspaceRoot);
  await evidenceBarrier.runEvidenceBarrier({ db, agentId: row.id, normalizedMission: input,
    autonomyPlan: ctx.autonomyPlan, contractRecord, autonomousWorkers: workers, strict: true });
  return { ctx, workers, experimentId: ctx.autonomyPlan.trinity.missionId };
}

async function assertEscalatedComparison(db, result) {
  await telemetry.flush(10000);
  const worlds = await db.all(`SELECT world_number, agent_id, status, evidence_vector_json FROM trinity_worlds
    WHERE experiment_id = ? ORDER BY world_number`, result.experimentId);
  assert.equal(worlds.length, 3);
  assert.deepEqual(worlds.map((world) => world.world_number), [1, 2, 3]);
  assert.equal(new Set(worlds.map((world) => world.agent_id)).size, 3);
  const reports = await comparativeBarrier.buildWorldReportsFromMission(db, result.experimentId);
  assert.equal(reports.length, 3);
  assert.ok(reports.every((entry) => entry.report?.outcome === 'success'));
  assert.ok(worlds.every((world) => world.status === 'compared'));
  assert.ok(worlds.every((world) => {
    const vector = JSON.parse(world.evidence_vector_json || '{}');
    return vector.correctness === 1 && vector.coverage === null && vector.robustness === 0.5;
  }), 'production comparison must preserve unmeasured finite-trial coverage as null');
  assert.ok(reports.every((entry) => !Object.hasOwn(entry.report.evidenceVectorEvidence || {}, 'coverage')),
    'finite procedure checks must not claim universal coverage without a dedicated proof');
  for (const world of worlds) {
    const events = await db.all(`SELECT event_type FROM telemetry_events WHERE agent_id = ?
      AND event_type IN ('DETERMINISTIC_WORKER_STARTED', 'EVIDENCE_REPORT', 'AGENT_COMPLETED')`, world.agent_id);
    assert.deepEqual(events.map((event) => event.event_type).sort(), [
      'DETERMINISTIC_WORKER_STARTED', 'EVIDENCE_REPORT', 'AGENT_COMPLETED'
    ].sort());
  }
  const comparison = result.ctx.autonomyPlan.trinity.comparison;
  assert.equal(comparison.canMerge, false, JSON.stringify(comparison));
  assert.equal(comparison.outcome, 'ESCALATE_EXPERIMENT');
  assert.equal(comparison.reason, 'required_evidence_vector_or_provenance_missing');
  assert.equal(comparison.crossExamination.status, 'complete');
  assert.ok(comparison.crossExamination.worlds
    .every((world) => world.status === 'verified' && world.receipts.length === 1));
  assert.ok(Number.isFinite(comparison.bestScore));
  assert.equal(comparison.promotion.promoted, false);
  const experiment = await db.get('SELECT status, decision_json FROM trinity_experiments WHERE mission_id = ?', result.experimentId);
  assert.equal(experiment.status, 'escalated');
  assert.equal(JSON.parse(experiment.decision_json).outcome, 'ESCALATE_EXPERIMENT');
}

async function qualify(root) {
  const dbPath = path.join(root, 'qualification.sqlite');
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  const capsuleRoot = path.resolve(__dirname, '../../.genos-agent-worlds', `gqwf-trinity-${crypto.randomUUID()}`);
  await fs.mkdir(capsuleRoot, { recursive: true });
  process.env.GENOS_CAPSULE_ROOT = capsuleRoot;
  let db = await database.getDatabase(dbPath);
  const workers = [];
  try {
    const source = await createWorkspace(db, root, '42\n');
    const mission = await runMission(db, source, 'mission-three-worker-promotion');
    workers.push(...mission.workers);
    await require('../src/services/garageRuntimeService').stop(db);
    await assertEscalatedComparison(db, mission);
    await telemetry.flush(10000);
    await database.closeDatabase();
    db = await database.getDatabase(dbPath);
    const replay = await db.get('SELECT status, decision_json FROM trinity_experiments WHERE mission_id = ?', mission.experimentId);
    assert.equal(replay.status, 'escalated');
    assert.equal(JSON.parse(replay.decision_json).outcome, 'ESCALATE_EXPERIMENT');
  } finally {
    await telemetry.flush(10000);
    await require('../src/services/garageRuntimeService').stop(db);
    await database.closeDatabase();
    for (const worker of workers) await require('../src/services/agentWorkspaceLifecycleService')
      .cleanupWorkspace(worker.workspaceRoot).catch(() => {});
    if (path.basename(capsuleRoot).startsWith('gqwf-trinity-')
        && path.basename(path.dirname(capsuleRoot)) === '.genos-agent-worlds') {
      await fs.rm(capsuleRoot, { recursive: true, force: true });
    }
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gqwf-trinity-qualification-'));
  try { await qualify(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
  console.log('GQWF Trinity three-worker run, independent claim checks, fail-closed comparison and restart: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
