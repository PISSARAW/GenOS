'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const execution = require('../../src/services/strategyExecutionService');
const workerStore = require('../../src/services/biologicalWorkerStore');
const registry = require('../../src/services/verifierTrustRegistry');
const subject = require('../../src/services/epistemic/oracleModelSubject');
const outcome = require('../../src/services/missionOutcomeContract');
const trust = require('../../src/services/missionActionRuntimeTrust');
const transport = require('../../src/services/workerDossierHandoffService');
const KEY = crypto.randomBytes(32).toString('hex');
const METHOD = { version: 1, methodId: 'model_subset_sum', parameters: { values: [3, 5, 7], target: 10 } };

async function worker(db, input) {
  const agentId = `dossier-model-${input.label}-${crypto.randomUUID()}`;
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id,metadata_json)
    VALUES(?,?,'bounded_worker','idle','worker','delegation-root','delegation-ws',?)`, agentId, input.label,
  JSON.stringify({ workerKind: 'bounded_worker', workerContract: { mission: { methodContract: METHOD } } }));
  await require('../../src/services/missionIdentityService').attachAgent(db, {
    missionId: 'delegation-mission', agentId, role: 'bounded_worker' });
  return { agentId, missionId: 'delegation-mission', workspaceRoot: input.workspace, workspaceId: 'delegation-ws',
    orchestratorAgentId: 'delegation-root', modelBudgetScope: input.scope, prompt: input.prompt,
    executionBudget: { tokens: 4000, costUsd: 1, latencyMs: 60000 }, timeoutMs: 60000,
    toolLease: [], capabilities: [] };
}

function contract() {
  const value = require('../../src/services/strategyContractService').buildStrategyContract({ mission: 'Verify a measured subset-sum model answer.' });
  return { ...value, execution_pipeline: [],
    mission_outcome: { schema: outcome.SCHEMA_V2, goal: 'Answer subset sum', statuses: [...outcome.STATUSES],
      obligations: [{ id: 'answer', statement: subject.STATEMENT, oracle: { domain: 'model_subset_sum',
        verifierDigest: registry.ensureVerifier('model_semantic').digest, validityDomain: subject.DOMAIN } }] },
    promotion: { require_independent_verification: true, require_epistemic_assurance: true,
      native_verification: { executions: 2, latencyMs: 10000 }, epistemic_verifier_digests: registry.listVerifierDigests() } };
}

async function prepare(db, mission) {
  const agentId = mission.agentId;
  const dispatchedAgent = await db.get('SELECT * FROM agents WHERE id=?', agentId);
  const contractRecord = await require('../../src/services/strategyContractService').saveContract(db, {
    agentId: 'delegation-root', workspaceId: dispatchedAgent.workspace_id,
    contract: contract(), createdBy: 'dossier-model-oracle-fixture' });
  const run = await execution.createExecutionRun(db, { agentId, missionId: mission.missionId,
    contractRecord, budget: { ...mission.executionBudget, events: 100 } });
  const ctx = { db, agentId, executionRun: run, contractRecord, normalizedMission: mission,
    dispatchedAgent, runtimeBudget: run.budget, autonomyPlan: {}, executable: process.argv[1] };
  await require('../../src/services/missionProtocols/synapse').prepare(ctx);
  await require('../../src/services/missionProtocols/allostasis').prepare(ctx);
  await require('../../src/services/missionEnvelopeAuthority').seal(ctx);
  await require('../../src/services/missionProtocols/runtime').initialize(ctx);
  await require('../../src/services/missionProtocols/runtime').beforeExecution(ctx);
  return ctx;
}

function action(ctx) {
  const value = { id: 'solve-subset', kind: 'small_model', covers: ['answer'], requiredEvidenceRefs: ['fixture:subset'],
    cost: { execution: { tokens: 300, usd: 0.1, latencyMs: 10000 },
      verification: { tokens: 0, usd: 0, latencyMs: 10000 }, maxRetries: 0 },
    execution: { prompt: ctx.normalizedMission.prompt, model: 'openai://handoff-fixture', oracleDomain: 'model_subset_sum' },
    calibrationReceipt: { probabilityVerified: { min: 0.8, max: 0.9 }, evidenceRefs: ['fixture:subset'],
      issuer: 'dossier-fixture-only', validUntil: new Date(Date.now() + 60000).toISOString() } };
  value.calibrationReceipt.signature = `sha256:${crypto.createHmac('sha256', KEY).update(trust.attestationPayload({
    runId: ctx.executionRun.id, missionId: ctx.normalizedMission.missionId, contract: ctx.contractRecord.contract.mission_outcome,
    action: value })).digest('hex')}`;
  return value;
}

async function complete(ctx, report) {
  const db = ctx.db;
  const request = { runId: ctx.executionRun.id, agentId: ctx.agentId };
  const nativeOracleRef = await require('../../src/services/epistemic/nativeOracleCoordinator').prepare(db, request);
  const scope = await require('../../src/services/gvxMissionProvenance').agentScope(db, ctx.agentId);
  const attestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
    { ...request, scope, kind: 'attestation' });
  assert.equal(attestation.value.accepted, true);
  assert.equal(attestation.value.domain, 'model_subset_sum');
  assert.equal(attestation.value.costs.processes, 2);
  assert.equal(attestation.value.costs.complete, true);
  const assembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, attestation.value.assemblyId);
  const processIds = assembly.evaluation.assembly.verifications.map(item => item.executionEvidence[0].processId);
  assert.equal(new Set(processIds).size, 2);
  assert.ok(processIds.every(id => id !== process.pid));
  const saved = await execution.recordExecutionEvent(db, ctx.agentId, { id: `complete:${request.runId}`,
    eventType: 'AGENT_COMPLETED', timestamp: new Date().toISOString(), payload: { executionRunId: request.runId,
      evidenceReport: report, nativeOracleRef, usage: { total_tokens: 0, cost_usd: 0 } } });
  assert.equal(saved.run.status, 'completed', saved.run.guardrailReason);
  assert.equal(saved.biologicalReceipt.result.verified, true);
  assert.equal(saved.biologicalReceipt.costs.find(item => item.register === 'worker_llm_tokens').quantity, 50);
  await require('../../src/services/missionProtocols/runtime').finish(db, request.runId);
}

async function run(db, input) {
  const ctx = await prepare(db, input.mission);
  const mission = ctx.normalizedMission;
  await transport.admit(db, { mission, executionRun: ctx.executionRun });
  const result = await require('../../src/services/missionActionRuntimeService').run({ db,
    request: { executionRunId: ctx.executionRun.id, agentId: ctx.agentId, missionId: mission.missionId,
      decision: { mode: 'active', actions: [action(ctx)] } }, config: { active: true, key: KEY } });
  assert.equal(result.status, 'executed_unverified');
  const observations = await workerStore.observations(db, ctx.executionRun.id);
  const observed = observations.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1).event.payload.evidenceReport;
  const report = transport.attachReport(mission, { ...observed, transportHandoffs: [{ acknowledgment: 'forged-model-ack' }] });
  await execution.recordExecutionEvent(db, ctx.agentId, { id: `dossier-evidence:${ctx.executionRun.id}`,
    eventType: 'EVIDENCE_REPORT', timestamp: new Date().toISOString(),
    payload: { executionRunId: ctx.executionRun.id, evidenceReport: report } });
  await complete(ctx, report);
  const attempt = await db.get('SELECT * FROM model_attempt_ledger WHERE mission_id=? AND provider_called=1', ctx.executionRun.id);
  assert.equal(attempt.budget_reservation_id, mission.modelBudgetScope.id);
  assert.equal(attempt.token_usage_source, 'provider');
  return { executionRun: ctx.executionRun, mission };
}

module.exports = { worker, run };
