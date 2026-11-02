'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { applyNativeMissionPlan, assertNativePlanDigest } = require('../../src/services/nativeMissionPlanService');
const authority = require('../../src/services/missionEnvelopeAuthority');

const budget = { tokens: 12000, events: 100, latencyMs: 60000 };

async function seed(db, input) {
  const { id, workspace } = input;
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?)', id, id);
  await db.run('INSERT INTO projects (id,organization_id,name) VALUES (?,?,?)', id, id, id);
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    id, id, workspace, id, id);
  await db.run(`INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,cognitive_budget)
    VALUES (?,?,'orchestrator','running','orchestrator',?,1000000)`, id, id, id);
  await require('../../src/services/missionIdentityService').create(db,
    { missionId: id, objective: 'Restore a valid resource allocation under independent verification.', orchestratorAgentId: id });
  const contract = require('../../src/services/strategyContractService').buildStrategyContract({
    problem: 'Restore a valid resource allocation under independent verification.' });
  contract.execution_pipeline = ['deterministic_execution'];
  contract.promotion.require_independent_verification = true;
  contract.promotion.native_verification = { executions: 2, latencyMs: 30000 };
  await require('../../src/services/strategyContractService').saveContract(db,
    { agentId: id, workspaceId: id, contract, createdBy: 'worker-cooperation-qualification' });
  const control = await require('./workerCooperationControl.cjs').prepare(db, { ...input, budget });
  return { db, id, workspace, stages: [], control };
}

function planFor(context, objective) {
  const plan = applyNativeMissionPlan({ strategyContract: { primary: 'tree-search' },
    tokenPolicy: { total: budget.tokens, workerShare: 0.8, minimumWorkerTokens: 100, rounds: {} } },
  { agentId: context.id, missionId: context.id, executionPolicy: { workerFanoutLimit: 1 }, native_objectives: [objective] });
  assertNativePlanDigest(plan);
  return plan;
}

async function waitForRun(db, workerId) {
  const deadline = Date.now() + budget.latencyMs;
  while (Date.now() < deadline) {
    const row = await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', workerId);
    if (row && ['completed', 'blocked', 'failed', 'error', 'unverified', 'quarantined'].includes(row.status)) {
      assert.equal(row.status, 'completed', JSON.stringify(row));
      return row;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Worker ${workerId} exceeded the qualification deadline.`);
}

async function evidenceFor(context, worker) {
  const { db } = context;
  const run = await waitForRun(db, worker.agentId);
  const saved = await authority.read(db, run.id);
  assert.equal(saved.envelope.missionId, context.id);
  assert.equal(saved.envelope.orchestratorId, context.id);
  assert.equal(saved.envelope.limits.tokens, 0);
  const binding = await require('../../src/services/missionProtocols/context').load(db, run.id);
  assert.equal(binding.mission.synapseContext.publisher.agentId, context.id);
  assert.equal(binding.mission.synapseContext.publisher.incarnationId, context.control.run.id);
  const request = { runId: run.id, agentId: worker.agentId, scope: saved.envelope.scope };
  const attestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
    { ...request, kind: 'attestation' });
  assert.equal(attestation?.value.accepted, true, JSON.stringify(attestation));
  assert.equal(attestation.value.costs.processes, 2);
  const assembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, attestation.value.assemblyId);
  const verifications = assembly.evaluation.assembly.verifications;
  assert.ok(verifications.every(item => item.status === 'verified' && item.independent));
  const processIds = verifications.map(item => item.executionEvidence[0].processId);
  assert.equal(new Set(processIds).size, 2);
  assert.ok(processIds.every(id => id !== process.pid));
  const receipt = await require('../../src/services/biologicalWorkerStore').receipt(db, run.id);
  assert.equal(receipt.result.verified, true);
  const observations = await require('../../src/services/biologicalWorkerStore').observations(db, run.id);
  const terminal = observations.find(item => item.event.eventType === 'AGENT_COMPLETED').event;
  const event = { executionRunId: run.id, nativeOracleRef: terminal.payload.nativeOracleRef,
    evidenceReport: terminal.payload.evidenceReport };
  const checks = require('../../src/services/missionDossierOracleVerification');
  assert.equal(await checks.trustedEvent({ db, workerId: worker.agentId, event, missionId: context.id }), true);
  assert.equal(await checks.trustedEvent({ db, workerId: worker.agentId, event, missionId: 'foreign-mission' }), false);
  const observation = await db.get(`SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='EVIDENCE_REPORT' ORDER BY rowid DESC LIMIT 1`, worker.agentId);
  const report = JSON.parse(observation.payload_json).evidenceReport;
  const costs = receipt.costs.filter(item => item.register === 'worker_llm_tokens');
  assert.ok(costs.length > 0);
  assert.ok(costs.every(item => item.quantity === 0));
  return { runId: run.id, workerId: worker.agentId, kind: worker.workerKind,
    missionId: saved.envelope.missionId, scope: saved.envelope.scope,
    workspaceRoot: worker.workspaceRoot, authorityHash: saved.hash, oracleHash: attestation.hash,
    oracleDomain: attestation.value.domain, oracleCosts: attestation.value.costs, processIds,
    tokens: costs.reduce((total, item) => total + item.quantity, 0), report };
}

async function execute(context, input) {
  assert.ok(context.stages.length < 4, 'The scenario may dispatch at most four workers.');
  await authority.assertRun(context.db, { agentId: context.id, runId: context.control.run.id,
    mission: context.control.ctx.normalizedMission });
  const plan = planFor(context, input.objective);
  const assignment = plan.dispatchWorkers[0];
  assert.equal(assignment.workerKind, input.expectedKind);
  const mission = { missionId: context.id, prompt: input.objective.goal,
    workspaceRoot: context.workspace, workspaceProvisioned: true, timeoutMs: budget.latencyMs,
    executionBudget: budget, executionPolicy: { allowFileEdits: false }, executor: 'local', localRuntime: true };
  const workers = await require('../../src/services/agentFleetWorkers').createAutonomousWorkers(context.db,
    { id: context.id, agent_type: 'GenOS' }, { plan, mission });
  assert.equal(workers.length, 1);
  const worker = workers[0];
  await require('../../src/services/missionIdentityService').attachAgent(context.db,
    { missionId: context.id, agentId: worker.agentId, role: worker.role });
  const row = await context.db.get('SELECT parent_agent_id,metadata_json FROM agents WHERE id=?', worker.agentId);
  assert.equal(row.parent_agent_id, context.id);
  const contract = JSON.parse(row.metadata_json).workerContract;
  assert.deepEqual(contract.mission.methodContract, input.objective.methodContract);
  await require('../../src/services/agentRuntimeAdapter').startMission({ ...mission,
    agentId: worker.agentId, orchestratorAgentId: context.id, role: worker.role,
    workerKind: worker.workerKind, workerContract: contract, methodContract: input.objective.methodContract,
    recoveryLease: input.objective.recoveryLease, prompt: worker.prompt,
    workspaceId: worker.workspaceId, workspaceRoot: worker.workspaceRoot });
  const evidence = await evidenceFor(context, worker);
  evidence.inputRefs = input.inputRefs || [];
  evidence.objective = input.objective;
  evidence.authority = contract.authority;
  evidence.planDigest = plan.nativeMissionPlan.digest;
  context.stages.push(evidence);
  await fs.writeFile(path.join(context.workspace, 'cooperation-context.json'), JSON.stringify(context.stages));
  return { ...evidence, contract };
}

module.exports = { seed, execute, planFor };
