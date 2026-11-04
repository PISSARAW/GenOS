'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'windows-protocol-test-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolWindowsFixture');
const { runWindowsLocalExecution } = require('../bin/orchestratorWindowsLocalExecution.cjs');

async function realEntryRegistersBeforeWorker() {
  const { ctx, input } = await fixture.create();
  let observed;
  let outcome;
  let postflightObserved = false;
  try {
    await ctx.db.run("UPDATE agents SET status='running' WHERE id='parent'");
    input.evaluateMissionContinuity = async request => { outcome = request.outcome; return {}; };
    await runWindowsLocalExecution(input, { runPostflight: async () => {
      postflightObserved = true;
      assert.equal((await ctx.db.get('SELECT status FROM strategy_execution_runs WHERE id=?', observed.run.id)).status, 'running');
      return { observedTools: [], receipts: [] };
    },
      runLocalWorker: async (db, mission, run) => {
        observed = { mission, run };
        const binding = await require('../src/services/missionProtocols/context').load(db, run.id);
        assert.ok(binding && !binding.preparing);
        assert.equal(binding.mission.modelBudgetScope.id, mission.modelBudgetScope.id);
        assert.equal(binding.mission.executionPolicy.allowFileEdits, false);
        assert.equal(mission.requestTokenBudget, 100);
        await require('../src/services/missionProtocols/continuity').beforeExecution(binding);
        const scope = await db.get('SELECT * FROM mission_model_budget_scopes WHERE scope_id=?', mission.modelBudgetScope.id);
        assert.equal(scope.organization_id, 'org'); assert.equal(scope.project_id, 'project');
        assert.equal(scope.token_ceiling, 100); assert.equal(scope.cost_ceiling_usd, 0.1);
        const output = await require('../src/services/missionProtocols/omega').executeNativeGraph({
          graph: { id: 'windows-native-read', domain: 'runtime', objectStore: { source: 7 },
            operations: [{ id: 'read', kind: 'READ', reference: 'source', dependsOn: [] }] },
          context: { db, agentId: mission.agentId, missionId: mission.missionId, executionRunId: run.id,
            routeActionId: 'windows-read', prompt: mission.prompt }, candidates: [], mode: 'fallback', options: {} });
        assert.equal(output.protocol.name, 'OMEGA'); assert.equal(output.result, 7);
        let applied = false;
        await assert.rejects(require('../src/services/missionProtocols/runtime').recordEvent(db, {
          agentId: mission.agentId, event: { eventType: 'AGENT_COMPLETED', timestamp: new Date().toISOString(),
            payload: { executionRunId: run.id } }, apply: async () => { applied = true; } }), /EVIDENCE|verification|oracle|ORACLE/i);
        assert.equal(applied, false);
        return { started: true, unresolved: false };
      } });
    assert.ok(observed.mission.executionAuthorityRef);
    const sealed = await require('../src/services/missionEnvelopeAuthority').read(ctx.db, observed.run.id);
    const clinical = await require('../src/services/workerClinicalAdmission').verifyRun(ctx.db, {
      runId: observed.run.id, agentId: input.id, missionId: input.missionId,
      scope: { organizationId: 'org', projectId: 'project' } });
    assert.equal(sealed.envelope.clinicalAdmissionHash, clinical.hash);
    await assert.rejects(require('../src/services/workerClinicalAdmission').verifyRun(ctx.db, {
      runId: observed.run.id, agentId: input.id, missionId: input.missionId,
      scope: { organizationId: 'org', projectId: 'project' },
      at: new Date(Date.parse(clinical.record.validUntil) + 1).toISOString() }),
    { code: 'WORKER_CLINICAL_ADMISSION_EXPIRED' });
    assert.equal(sealed.envelope.evidencePolicy.transportSuccessIsEvidence, false);
    assert.equal((await ctx.db.get('SELECT status FROM strategy_execution_runs WHERE id=?', observed.run.id)).status, 'failed');
    assert.equal(postflightObserved, true);
    assert.equal(outcome.success, false, 'started:true without native completion and accepted EVIDENCE cannot become success');
    assert.equal(outcome.verdict, 'unverified');
    assert.equal((await ctx.db.get('SELECT status FROM agents WHERE id=?', input.id)).status, 'running',
      'the orchestrator agent lifetime is not terminalized by deferred worker output');
  } finally { await ctx.close(); }
}

async function authorityFailuresCannotDowngrade() {
  const { ctx, input } = await fixture.create();
  let calls = 0;
  const services = { runLocalWorker: async () => { calls += 1; }, runPostflight: async () => ({}) };
  try {
    await assert.rejects(runWindowsLocalExecution(input, { ...services, testHarness: true }), /HARNESS_FORBIDDEN/);
    await assert.rejects(runWindowsLocalExecution({ ...input, request: { ...input.request, workspaceRoot: ctx.root } }, services), /WORKSPACE_ROOT_MISMATCH/);
    await ctx.db.run("UPDATE mission_execution_authority SET state='failed'");
    await assert.rejects(runWindowsLocalExecution(input, services), /MISSION_AUTHORITY_STALE/);
    assert.equal(calls, 0);
    assert.equal((await ctx.db.get("SELECT COUNT(*) AS count FROM strategy_execution_runs WHERE id LIKE 'local-direct-%' OR id LIKE 'test-harness:%'")).count, 0);
    await ctx.db.run('DELETE FROM strategy_contracts WHERE agent_id=?', input.id);
    await assert.rejects(runWindowsLocalExecution(input, services), /CONTRACT_REQUIRED/);
    assert.equal(calls, 0);
  } finally { await ctx.close(); }
}

async function main() {
  await realEntryRegistersBeforeWorker();
  await authorityFailuresCannotDowngrade();
  await clinicalRefusalsCannotDowngrade();
  console.log('Windows real mission entry seals complete native context, executes OMEGA, blocks evidence bypass and refuses authority fallback: PASS');
}

async function clinicalRefusalsCannotDowngrade() {
  const { ctx, input } = await fixture.create();
  let calls = 0;
  const services = { runLocalWorker: async () => { calls += 1; }, runPostflight: async () => ({}) };
  try {
    await ctx.db.run("UPDATE agents SET execution_mode='worker',status='running' WHERE id=?", input.id);
    await require('../src/services/missionIdentityService').attachAgent(ctx.db, {
      missionId: input.missionId, agentId: input.id, role: 'bounded_worker' });
    const contractRecord = await require('../src/services/strategyContractService').getLatestContract(ctx.db, input.id);
    await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
      agentId: input.id, missionId: input.missionId, contractRecord, budget: input.missionBudget });
    await assert.rejects(runWindowsLocalExecution(input, services), { code: 'WORKER_CLINICAL_ADMISSION_CONFLICT' });
    await ctx.db.run("UPDATE agents SET execution_mode='orchestrator' WHERE id=?", input.id);
    await ctx.db.run('UPDATE clinical_states SET pathogen_burden=1,immune_titer=0 WHERE agent_id=?', input.id);
    await assert.rejects(runWindowsLocalExecution(input, services), { code: 'AGENT_QUARANTINED' });
    assert.equal(calls, 0, 'clinical refusal must precede any worker callback');
    assert.equal((await ctx.db.get('SELECT cell_cycle_state FROM clinical_states WHERE agent_id=?', input.id)).cell_cycle_state, 'arrested');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
