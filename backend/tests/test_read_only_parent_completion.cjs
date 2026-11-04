'use strict';

const fixture = require('./helpers/biologicalWorkerRestartFixture');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {openDatabase} = require('./helpers/biologyDatabase');
const {completion} = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const promotion = require('../src/services/strategyPromotionGate');
const {digest} = require('../src/services/biologicalIntegrity');

async function parentContext(db, input) {
  const contract = {execution_pipeline: [], strategy_portfolio: [], evaluation_mode: input.mode,
    promotion: {require_replay: true, require_independent_verification: true,
      native_verification: {executions: 2, latencyMs: 30000}}};
  const record = {id: 'parent-' + input.label, version: 1, contract};
  await db.run('INSERT INTO strategy_contracts VALUES (?, ?, 1, ?, ?)', record.id, 'parent',
    JSON.stringify(contract), `sha256:${digest(contract)}`);
  const run = await execution.createExecutionRun(db, {agentId: 'parent', missionId: 'worker-mission',
    contractRecord: record, budget: {tokens: 0, deterministic: true, latencyMs: 60000}});
  const ctx = {db, agentId: 'parent', contractRecord: record, executionRun: run,
    executable: process.execPath, autonomyPlan: {}, dispatchedAgent: {workspace_id: 'worker-workspace'},
    normalizedMission: {agentId: 'parent', missionId: 'worker-mission', workspaceId: 'worker-workspace',
      workspaceRoot: input.workspace, toolLease: [], timeoutMs: 60000}};
  await require('../src/services/missionEnvelopeAuthority').seal(ctx);
  await require('../src/services/missionProtocols/runtime').initialize(ctx);
  return ctx;
}

async function verifiedChild(db, filename, record) {
  const run = await fixture.createRun(db, filename, record);
  const child = spawnSync(process.execPath,
    [path.join(__dirname, 'helpers/biologicalWorkerProbe.cjs'), 'execute', filename, run.id],
    {encoding: 'utf8', timeout: 30000, windowsHide: true});
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout).report;
  const reference = await fixture.observeAndVerify(db, run, report);
  const event = completion(run.id, {report, usage: {total_tokens: 0, cost_usd: 0}});
  event.payload.nativeOracleRef = reference;
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(saved.biologicalReceipt.result.verified, true);
  assert.equal(saved.biologicalReceipt.semanticVerification.costs.processes, 2);
  return {report: {...report, claims: report.claims.map(row => ({...row, workerId: 'worker'})),
    delegatedOracleRefs: [{agentId: 'worker', runId: run.id, reference}]}};
}

async function completeParent(ctx, report) {
  const event = completion(ctx.executionRun.id, {report, usage: {total_tokens: 0, cost_usd: 0}});
  return {event, saved: await execution.recordExecutionEvent(ctx.db, 'parent', event)};
}

async function qualifyReadOnly(ctx, report) {
  const evaluation = require('../src/services/localRuntimeCanonicalEvaluation');
  const canonical = JSON.stringify({...report, schema: 'genos.canonical-final-report/v1'});
  const state = {mission: {executionRunId: ctx.executionRun.id, agentId: 'parent', missionId: 'worker-mission'}};
  const checked = await evaluation.evaluate(state, canonical, ctx.db);
  assert.equal(checked.status, 'verified_claims');
  assert.equal(checked.verification, 'delegated_native_semantic_oracles');
  assert.deepEqual(checked.workerIds, ['worker']);
  const terminal = require('../src/services/agentTerminalStatusService').evaluateTerminalStatus({
    dispatchedAgent: {execution_mode: 'orchestrator'},
    autonomyPlan: {synthesisOnly: true, completedWorkerIds: ['worker']},
    state: {verifiedDossierWorkerIds: checked.workerIds,
      missionDomainState: {unverified: false, hasDomainFailure: false}}},
  {eventType: 'AGENT_COMPLETED', status: 'completed'}, 'completed');
  assert.equal(terminal.verdict, 'succeeded');
  await ctx.db.exec('CREATE TABLE IF NOT EXISTS mission_model_budget_scopes(scope_id TEXT PRIMARY KEY,parent_run_id TEXT,parent_agent_id TEXT)');
  await ctx.db.run('INSERT INTO mission_model_budget_scopes VALUES (?,?,?)', 'parent-scope', ctx.executionRun.id, 'parent');
  assert.equal((await evaluation.evaluate({mission: {agentId: 'parent', missionId: 'worker-mission',
    modelBudgetScopeJson: JSON.stringify({id: 'parent-scope'})}}, canonical, ctx.db)).status, 'verified_claims');
  await assert.rejects(evaluation.evaluate({...state, mission: {...state.mission, missionId: 'foreign'}},
    canonical, ctx.db), {code: 'CANONICAL_NATIVE_EVIDENCE_REQUIRED'});
  const {event, saved} = await completeParent(ctx, report);
  assert.equal(saved.run.status, 'completed');
  assert.equal(saved.halt, false);
  const proof = await require('../src/services/epistemic/nativeOracleGate').context(ctx.db,
    {row: {id: ctx.executionRun.id, agent_id: 'parent'}, event});
  assert.equal(proof.delegated, true);
  assert.match(promotion.completionGuardrail(ctx.contractRecord.contract, event.payload,
    {agentId: 'parent', gateContext: proof.gateContext}), /require_replay/);
  const dossier = await ctx.db.get('SELECT dossier_json FROM mission_protocol_evidence WHERE run_id=?', ctx.executionRun.id);
  assert.equal(JSON.parse(dossier.dossier_json).delegated, true);
}

async function qualifyOrdinary(db, input) {
  const ctx = await parentContext(db, {...input, mode: null, label: 'ordinary'});
  const {saved} = await completeParent(ctx, input.report);
  assert.equal(saved.run.status, 'blocked');
  assert.match(saved.run.guardrailReason, /require_replay/);
  assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', ctx.executionRun.id)).status, 'blocked',
    'The blocked completion must persist rather than roll back to a ghost running state.');
  assert.equal(await db.get('SELECT run_id FROM mission_protocol_evidence WHERE run_id=?', ctx.executionRun.id), undefined);
}

async function rejectFlags(db, input) {
  const ctx = await parentContext(db, {...input, mode: 'factual_read_only', label: 'unattested'});
  const event = completion(ctx.executionRun.id, {usage: {total_tokens: 0, cost_usd: 0}});
  Object.assign(event.payload, {evidenceVerified: true, independentVerification: true});
  await assert.rejects(execution.recordExecutionEvent(db, 'parent', event), {code: 'MISSION_EVIDENCE_REQUIRED'});
  assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', ctx.executionRun.id)).status, 'planned');
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-parent-completion-'));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const filename = path.join(root, 'runtime.sqlite'), db = openDatabase(filename);
  const telemetry = require('../src/services/telemetryObserver'), previous = telemetry.persistAsync;
  telemetry.persistAsync = () => {};
  try {
    const record = await fixture.setup(db);
    await db.run('INSERT INTO mission_agents(mission_id,agent_id) VALUES (?,?)', 'worker-mission', 'parent');
    const ctx = await parentContext(db, {workspace, mode: 'factual_read_only', label: 'readonly'});
    const child = await verifiedChild(db, filename, record);
    await qualifyReadOnly(ctx, child.report);
    await qualifyOrdinary(db, {workspace, report: child.report});
    await rejectFlags(db, {workspace});
  } finally {
    telemetry.persistAsync = previous;
    await db.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('genos-parent-completion-'));
    fs.rmSync(root, {recursive: true, force: true});
  }
  console.log('Real delegated native evidence completes a sealed read-only parent while ordinary promotion stays blocked; blocked state persists and bare caller flags remain refused: PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
