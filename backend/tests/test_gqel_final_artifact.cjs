'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-final-artifact-test-only';
const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/qualityReceiptFixture.cjs');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const plans = require('../src/services/qualityElevation/qualityFinalPlan');
const finalQuality = require('../src/services/qualityElevation/qualityFinalArtifactService');
const runs = require('../src/services/aTeam/teamRunStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const { teamClosureInput } = require('../src/services/aTeam/execution/teamExecutionService');

function plan() {
  return { missionId: 'parent', goal: 'Produire le livrable intégré.', qualityElevation: compileQualityContract({
    mission: 'Produire le livrable intégré.', domain: 'generic', policy: 'fast' }),
  qualityRuntime: { reviewers: [{ id: 'reader', model: 'ollama://reader' }] },
  members: [{ memberId: 'source', workerId: 'source-worker', role: 'literary_author', label: 'source',
    outputs: ['draft'], capabilities: ['author'], executionBudgetTokens: 5000 },
  { memberId: 'integration', workerId: 'worker', role: 'literary_author', label: 'integration',
    outputs: ['delivery'], inputArtifacts: ['draft'], dependsOn: ['source'], capabilities: ['integrate'], executionBudgetTokens: 5000 }] };
}

async function canonicalFinalProducer() {
  const db = openDatabase();
  try {
    const input = plan();
    const created = await runtime.createRun({ ...input, db, status: 'READY', phase: 'PREBRIEF' });
    const run = await runs.load(db, created.run.teamRunId);
    assert.equal(run.finalArtifactMemberId, 'integration');
    assert.equal(run.members[0].qualityElevation, undefined);
    assert.equal(run.members[1].qualityElevation.digest, input.qualityElevation.digest);
    assert.equal(run.members.length, input.members.length);
    assert.equal(run.members.reduce((sum, member) => sum + member.executionBudgetTokens, 0), 10000);
    assert.ok(created.graph.edges.some(edge => edge.fromNode.includes('source') && edge.toNode.includes('integration')));
    const repeated = await runtime.createRun({ ...input, db, qualityElevation: {
      mission: input.goal, domain: 'generic', policy: 'fast' }, status: 'READY', phase: 'PREBRIEF' });
    assert.equal(repeated.created, false);
    assert.equal(repeated.run.qualityElevation.contractId, run.qualityElevation.contractId);
    await assert.rejects(runtime.createRun({ ...input, db, qualityElevation: {
      mission: input.goal, domain: 'generic', policy: 'fast', minQualityScore: 99 } }),
    { code: 'ATEAM_RUN_IDEMPOTENCY_CONFLICT' });
    await rawMemberIdempotency(db);
    await assert.rejects(runs.update({ db, teamRunId: run.teamRunId, revision: run.revision,
      patch: { qualityElevation: undefined } }), { code: 'GQEL_CONTRACT_CHANGED' });
    const changed = { ...input, qualityRuntime: { ...input.qualityRuntime, finalArtifactMemberId: 'source' } };
    assert.throws(() => plans.configureFinalArtifact(changed), { code: 'GQEL_FINAL_PRODUCER_COVERAGE' });
    assert.throws(() => plans.configureFinalArtifact({ ...input,
      members: input.members.map(member => ({ ...member, dependsOn: [] })) }), { code: 'GQEL_FINAL_PRODUCER_AMBIGUOUS' });
    assert.throws(() => require('../src/services/qualityElevation/qualityMissionContract').qualityMissionFields({
      qualityRuntime: input.qualityRuntime }), { code: 'GQEL_INVALID_CONTRACT' });
    assert.throws(() => require('../bin/orchestratorRequestValidation.cjs').validateRequest('dispatch_trinity', input),
      { code: 'GQEL_FINAL_INTEGRATION_REQUIRED' });
    assert.throws(() => plans.configureFinalArtifact({ ...input,
      execution: { organizationPolicy: { variant: 'multiteam' } } }), { code: 'GQEL_FINAL_INTEGRATION_REQUIRED' });
  } finally { await db.close(); }
}

async function rawMemberIdempotency(db) {
  const input = { db, missionId: 'member-idempotency', goal: 'Same scoped mission',
    members: [{ memberId: 'writer', role: 'literary_author', outputs: ['text'],
      qualityElevation: { mission: 'Same scoped mission', domain: 'generic', policy: 'fast' } }] };
  const first = await runtime.createRun(input), second = await runtime.createRun(input);
  assert.equal(second.created, false);
  assert.equal(second.run.members[0].qualityElevation.contractId, first.run.members[0].qualityElevation.contractId);
  await assert.rejects(runtime.createRun({ ...input, members: [{ ...input.members[0], qualityElevation: {
    ...input.members[0].qualityElevation, minQualityScore: 99 } }] }), { code: 'ATEAM_RUN_IDEMPOTENCY_CONFLICT' });
}

async function completionFixture(ctx) {
  const report = { outcome: 'success', workerArtifact: { type: 'creative_candidate', content: {
    candidate: ctx.text, assumptions: ['Cette fiction constitue le livrable final.'],
    falsificationTest: 'Comparer chaque action au brief et à ses conséquences.' } } };
  report.qualityElevationReceipt = await require('../src/services/qualityElevation/qualityReceiptService')
    .issueQualityReceipt({ ...ctx, artifact: report.workerArtifact, report });
  const event = { id: 'final-completion', eventType: 'AGENT_COMPLETED', timestamp: new Date().toISOString(),
    payload: { executionRunId: ctx.executionRunId, evidenceReport: report } };
  const biology = require('../src/services/biologicalWorkerStore');
  const observed = await biology.observe(ctx.db, { agentId: 'worker', event });
  await biology.markApplied(ctx.db, { runId: ctx.executionRunId, eventKey: observed.eventKey });
  await ctx.db.run("UPDATE strategy_execution_runs SET status='completed',completed_at=? WHERE id=?", event.timestamp, ctx.executionRunId);
  return { db: ctx.db, run: { teamRunId: 'collective', missionId: 'parent', finalArtifactMemberId: 'integration',
    createdAt: new Date(Date.now() - 60000).toISOString(), qualityElevation: ctx.worker.workerContract.qualityElevation },
  plan: { members: [{ memberId: 'integration', workerId: 'worker' }] }, observed: {
    statuses: new Map([['worker', 'completed']]), verdicts: new Map([['worker', { promoted: true, report }]]),
    dossiers: [{ workerId: 'worker', events: [event] }] } };
}

async function signedFinalArtifact() {
  const ctx = await fixture.create();
  try {
    const input = await completionFixture(ctx);
    const result = await finalQuality.qualifyFinalArtifact(input);
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(result.artifact.artifact.content.candidate, ctx.text);
    assert.equal(result.artifact.authorizesMissionPromotion, false);
    assert.equal(finalQuality.finalQualityInvariant({ ...input, finalQuality: result })[0].passed, true);
    assert.equal(finalQuality.finalQualityInvariant({ ...input, finalQuality: { passed: true } })[0].passed, false);
    const saved = await ctx.db.get('SELECT record_json FROM gqel_final_artifacts WHERE team_run_id=?', 'collective');
    assert.deepEqual(JSON.parse(saved.record_json), result.artifact);
    await rejectReplaysAndChanges(input);
    assertClosureStillNeedsOtherGates(input, result);
  } finally { await ctx.close(); }
}

async function rejectReplaysAndChanges(input) {
  const report = input.observed.verdicts.get('worker').report;
  const original = report.workerArtifact.content.candidate;
  report.workerArtifact.content.candidate += ' Altération après évaluation.';
  assert.equal((await finalQuality.qualifyFinalArtifact(input)).passed, false);
  report.workerArtifact.content.candidate = original;
  const reused = { ...input, run: { ...input.run, teamRunId: 'another-team', createdAt: new Date(Date.now() + 1000).toISOString() } };
  assert.equal((await finalQuality.qualifyFinalArtifact(reused)).reason, 'GQEL_RECEIPT_SCOPE_MISMATCH');
  const foreign = { ...input, run: { ...input.run, missionId: 'other-orchestrator' } };
  assert.equal((await finalQuality.qualifyFinalArtifact(foreign)).reason, 'GQEL_RECEIPT_SCOPE_MISMATCH');
  await input.db.run("INSERT INTO strategy_execution_runs(id,agent_id,status) VALUES('new-attempt','worker','running')");
  assert.equal((await finalQuality.qualifyFinalArtifact(input)).reason, 'GQEL_RECEIPT_SCOPE_MISMATCH');
}

function assertClosureStillNeedsOtherGates(input, result) {
  const observed = { ...input.observed, promoted: false, gate: { passed: false }, observation: { observerReport: {} } };
  const closure = teamClosureInput({ ...input, observed, statistical: { allowed: false }, finalQuality: result });
  assert.equal(closure.invariants.find(item => item.id === 'final_artifact_quality_satisfied').passed, true);
  const completion = require('../src/services/missionClosureService').closeMission(closure);
  assert.equal(completion.success, false);
  const passed = teamClosureInput({ ...input, observed: { ...observed, promoted: true, gate: { passed: true } },
    statistical: { allowed: true }, finalQuality: result });
  assert.equal(require('../src/services/missionClosureService').closeMission(passed).success, true);
  const forged = teamClosureInput({ ...input, observed, statistical: { allowed: true }, finalQuality: { passed: true } });
  assert.equal(forged.invariants.find(item => item.id === 'final_artifact_quality_satisfied').passed, false);
}

async function main() {
  await canonicalFinalProducer(); await signedFinalArtifact();
  console.log('GQEL final artifact: funded integration member, verified handoffs, signed persistence, replay rejection and independent closure gates PASS (synthetic reviews and completion fixture).');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
