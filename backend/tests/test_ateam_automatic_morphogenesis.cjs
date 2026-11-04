'use strict';
const assert = require('node:assert/strict');
const fixture = require('./helpers/ateamLiveMorphogenesisFixture.cjs');
const service = require('../src/services/aTeam/adaptation/liveMorphogenesisService');
const receipts = require('../src/services/aTeam/adaptation/liveMorphogenesisReceipt');
const policy = require('../src/services/aTeam/adaptation/liveMorphogenesisPolicy');

async function automatic(kind) {
  const ctx = await fixture.create({ automatic: true, kind });
  try {
    assert.deepEqual(ctx.run.adaptiveMorphogenesis, { version: 2, mode: 'automatic', requireTransition: true });
    assert.equal(ctx.run.execution.liveMorphogenesis.status, 'WATCHING');
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM agents WHERE parent_agent_id=?', ctx.agentId)).n, 2);
    const changed = await service.maybeReplace(ctx);
    const receipt = changed.execution.liveMorphogenesis.receipt;
    assert.equal((await receipts.verify(ctx.db, changed)).passed, true);
    assert.equal(receipt.plan.aTeamPendingReplacement.selection.afterMember, 'author');
    assert.equal(receipt.plan.aTeamPendingReplacement.selection.targetMember, 'final');
    assert.equal(receipt.rustAuthority.decision, 'APPLY');
    assert.equal(receipt.protocol.status, 'finalized');
    assert.equal(changed.members[1].workerKind, kind);
    assert.equal(changed.members[1].role, ctx.run.members[1].role);
    assert.notEqual(changed.members[1].workerId, ctx.target.agentId);
    assert.ok(receipt.plan.aTeamPendingReplacement.source.defects.some(d => d.code === 'CRITERION_brief_coverage'));
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM strategy_execution_runs WHERE agent_id=?', ctx.target.agentId)).n, 0);
    console.log(`Automatic selection, signed semantic trigger, actual Rust/MORPH and same-kind transfer: ${kind} PASS. LLM replies are synthetic.`);
  } finally { await ctx.close(); }
}

async function noDefect() {
  const ctx = await fixture.create({ automatic: true, kind: 'synthesis_worker', noDefect: true });
  try {
    assert.equal(await service.maybeReplace(ctx), null);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM morphogenesis_transition_snapshots')).n, 0);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM agents WHERE parent_agent_id=?', ctx.agentId)).n, 2);
    assert.equal((await receipts.forClosure(ctx.db, ctx.run)).passed, false);
    console.log('No actual defect: no standby, no transition, no false strict qualification PASS.');
  } finally { await ctx.close(); }
}

async function measuredPressure() {
  const ctx = await fixture.create({ automatic: true, kind: 'bounded_worker', noDefect: true,
    workerBudget: 60000, usageInputTokens: 10000, pressureRatio: 0.25 });
  try {
    const updated = await service.maybeReplace(ctx);
    const source = updated.execution.liveMorphogenesis.receipt.plan.aTeamPendingReplacement.source;
    assert.deepEqual(source.defects, []);
    assert.equal(source.signals[0].code, 'GQEL_BUDGET_PRESSURE');
    assert.ok(source.signals[0].ratio >= 0.25);
    assert.equal((await receipts.verify(ctx.db, updated)).passed, true);
    console.log('Authenticated measured budget pressure can trigger native replacement without a fabricated quality defect: PASS.');
  } finally { await ctx.close(); }
}

function negativePolicy() {
  const quality = require('../src/services/qualityElevation/qualityContract').compileQualityContract({
    domain: 'generic', mission: 'Analyze inventory; do not write a screenplay or scénario.' });
  assert.equal(quality.profile, 'prose', 'An explicit generic domain must not become a screenplay through negated vocabulary.');
  const members = [{ memberId: 'a', role: 'math_worker', workerKind: 'math_worker', dependsOn: [] },
    { memberId: 'b', role: 'math_worker', workerKind: 'math_worker', dependsOn: ['a'] }];
  assert.throws(() => policy.assertPolicy({ version: 2, mode: 'automatic' }, members),
    { code: 'ATEAM_AUTO_MORPH_NO_ELIGIBLE_DEPENDENCY' });
  assert.throws(() => policy.assertPolicy({ version: 2, mode: 'automatic', replacement: { role: 'worker' } }, members),
    { code: 'ATEAM_LIVE_MORPH_POLICY_INVALID' });
}

function graphSelectionAndCoverage() {
  const auto = require('../src/services/aTeam/adaptation/liveMorphogenesisAutomaticPolicy');
  const members = [{ memberId: 'consumer', workerKind: 'synthesis_worker', role: 'synthesis_worker', dependsOn: ['producer'] },
    { memberId: 'unrelated', workerKind: 'bounded_worker', role: 'worker', dependsOn: [] },
    { memberId: 'producer', workerKind: 'bounded_worker', role: 'product_specialist', dependsOn: [] }];
  const pairs = auto.pairs(members);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].source.memberId, 'producer');
  const selected = auto.selection(pairs[0]);
  const run = { members, adaptiveMorphogenesis: { version: 2, mode: 'automatic' },
    execution: { liveMorphogenesis: { selection: selected } } };
  assert.deepEqual(auto.effective(run), selected);
  run.execution.liveMorphogenesis.selection.replacement.role = 'sub_orchestrator';
  assert.throws(() => auto.effective(run), { code: 'ATEAM_AUTO_MORPH_SELECTION_INVALID' });
  const plan = require('../src/services/qualityElevation/qualityFinalPlan').configureFinalArtifact({
    members: [members[2], members[0]], goal: 'Analyse des donnees', adaptiveMorphogenesis: run.adaptiveMorphogenesis,
    qualityElevation: { domain: 'generic' }, qualityRuntime: { finalArtifactMemberId: 'consumer' } });
  assert.ok(plan.members.every(member => member.qualityElevation.digest === plan.qualityElevation.digest));
}

function workspacePolicyPropagation() {
  const fields = require('../src/services/missionProtocols/launchPolicy').workspaceProtocolFields;
  assert.deepEqual(fields({}), {});
  const request = { executionPolicy: { gqwfV2: true, allowFileEdits: true }, allow_file_edits: false };
  const member = { memberId: 'm', workerId: 'w', subSystem: 'd', role: 'worker', workerKind: 'bounded_worker',
    dependsOn: [], capabilities: [], mission: 'Inspect supplied facts.', executionBudgetTokens: 1000 };
  const native = require('../bin/workerLaunchPayload.cjs').workerLaunchPayload({ context: { request }, member,
    workerId: 'w', parent: {} });
  const deferred = require('../src/services/aTeamStageScheduler').workerLaunchPayload({
    plan: { orchestratorId: 'parent' }, member, request });
  for (const payload of [native, deferred]) {
    assert.equal(payload.executionPolicy.gqwfV2, true);
    assert.equal(payload.allow_file_edits, false);
    assert.equal(payload.executionPolicy.allowFileEdits, undefined);
  }
}

function boundedQualityAllocations() {
  const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
  const enforcement = require('../src/services/agents/workerContractEnforcement');
  for (const kind of ['bounded_worker', 'specialist', 'synthesis_worker']) {
    const input = { workerKind: kind, nicheDomain: 'qualification', prompt: 'Analyse the provided facts.',
      executionBudget: { tokens: 100000 }, qualityElevation: { domain: 'generic', budgetMaxTokens: 90000 } };
    const mission = buildWorkerMission(input);
    assert.equal(mission.workerContract.resources.maxTokens, 90000);
    assert.doesNotThrow(() => enforcement.assertRuntimeContract(mission.workerContract, kind));
    const forged = structuredClone(mission.workerContract);
    forged.resources.maxTokens = 90001;
    assert.throws(() => enforcement.assertRuntimeContract(forged, kind), { code: 'INVALID_WORKER_CONTRACT' });
    delete input.qualityElevation;
    assert.ok(buildWorkerMission(input).workerContract.resources.maxTokens <= 20000);
  }
}

async function main() {
  negativePolicy(); graphSelectionAndCoverage(); workspacePolicyPropagation(); boundedQualityAllocations();
  for (const kind of ['creative_worker', 'bounded_worker', 'specialist', 'synthesis_worker']) await automatic(kind);
  await noDefect(); await measuredPressure();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
