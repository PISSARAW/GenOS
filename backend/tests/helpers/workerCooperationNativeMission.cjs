'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const CATALOG = Object.freeze({ resident_daemon: ['daemons/resident_daemon.dna', 'ResidentDaemon'],
  specialist: ['biomimetique/biome_population_specialist.dna', 'PopulationSpecialist'],
  verifier_worker: ['orchestration/evidence_barrier_arbiter.dna', 'EvidenceBarrierArbiter'] });

async function prepareCatalog(root) {
  const directory = path.join(root, 'dna-catalog');
  await fs.mkdir(directory);
  for (const [file] of Object.values(CATALOG)) {
    await fs.copyFile(path.resolve(__dirname, '../../../agents/dna', file), path.join(directory, path.basename(file)));
  }
  process.env.GENOS_AGENT_DNA = '1';
  process.env.GENOS_AGENT_DNA_DIR = directory;
}

async function prepare(context, budget) {
  const { db, id, workspace } = context;
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?)', id, id);
  await db.run('INSERT INTO projects (id,organization_id,name) VALUES (?,?,?)', id, id, id);
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)', id, id, workspace, id, id);
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,cognitive_budget)
    VALUES (?,?,'orchestrator','idle','orchestrator',?,1000000)`, id, id, id);
  const objective = 'Observe the current resource allocation; repair only a verified anomaly, verify independently and restore only an accepted checkpoint inside an isolated capsule.';
  await require('../../src/services/missionIdentityService').create(db,
    { missionId: id, objective, orchestratorAgentId: id });
  const contracts = require('../../src/services/strategyContractService');
  const contract = contracts.buildStrategyContract({ problem: objective });
  contract.promotion.require_independent_verification = true;
  contract.promotion.native_verification = { executions: 2, latencyMs: 30000 };
  await contracts.saveContract(db, { agentId: id, workspaceId: id, contract, createdBy: 'native-cooperation-qualification' });
  await require('../../src/services/agentDnaStore').ensureImported(db);
  for (const [, name] of Object.values(CATALOG)) {
    assert.ok(await require('../../src/services/agentDnaStore').loadGenome(db, name), `Native genome ${name} is unavailable.`);
  }
  const ctx = await require('../../src/services/nativeMissionController').prepare({ agentId: id, missionId: id,
    workspaceId: id, workspaceRoot: workspace, workspaceProvisioned: true, prompt: objective,
    executor: 'local', localRuntime: true, localModel: context.model, role: 'orchestrator',
    autonomousOrchestration: true, observationRequiredBeforePlanning: true,
    completionContract: { invariants: [{ id: 'native_completion', kind: 'functional',
      verifier: { type: 'context.flag', flag: 'nativeCompletionAccepted' } }],
    requiredEvidence: ['biological_worker_receipt'] },
    workerCount: 1, workerTypes: ['resident_daemon'], executionBudget: budget,
    timeoutMs: budget.latencyMs, executionPolicy: { allowFileEdits: false, allowedCommands: [] } });
  assert.ok(ctx.autonomyPlan?.schema && ctx.orchestratorBody, 'Native root planning and body are required.');
  context.control = { run: ctx.executionRun, ctx };
  context.workspace = ctx.normalizedMission.workspaceRoot;
  context.report.rootAgentId = id;
  context.report.parentRunId = ctx.executionRun.id;
  context.report.nativeController = { schema: ctx.autonomyPlan.schema, body: true,
    runtime: 'nativeMissionController', observationFirst: true };
}

function genomeRef(kind) { return CATALOG[kind]?.[1]; }

async function complete(context) {
  const claims = [], delegatedOracleRefs = [];
  const store = require('../../src/services/biologicalWorkerStore');
  for (const stage of context.report.stages) {
    const events = await store.observations(context.db, stage.runId);
    const terminal = events.find(item => item.applied && item.event.eventType === 'AGENT_COMPLETED');
    assert.ok(terminal?.event.payload.nativeOracleRef);
    claims.push(...stage.report.claims.map(claim => ({ ...claim, workerId: stage.workerId })));
    delegatedOracleRefs.push({ agentId: stage.workerId, runId: stage.runId, reference: terminal.event.payload.nativeOracleRef });
  }
  return require('../../src/services/nativeMissionController').complete(context.control.ctx,
    { outcome: 'success', claims, delegatedOracleRefs });
}

module.exports = { prepareCatalog, prepare, genomeRef, complete };
