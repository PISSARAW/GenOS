'use strict';
const base = require('./missionProtocolsMorphFixture');
const gqel = require('./gqelProgressFixture.cjs');
const { buildWorkerMission } = require('../../src/services/orchestratorDispatchService');
const teams = require('../../src/services/aTeam/aTeamRuntime');

async function create(options = {}) {
  const ctx = await base.create();
  try { return await setup(ctx, options); }
  catch (error) { await ctx.close(); throw error; }
}

async function setup(ctx, options) {
  const { db } = ctx;
  ctx.fixtureBudget = options.workerBudget || 10000;
  const lease = await require('../../src/services/missionIdentityService').attachOrchestrator(db, {
    missionId: ctx.missionId, agentId: ctx.agentId });
  const quality = options.automatic ? gqel.contract({ maxIterations: 2, domain: 'generic',
    mission: 'Integrate a checked domain dossier.', budgetMaxTokens: options.qualityBudget || 60000 })
    : gqel.contract({ maxIterations: 2, minBodyWords: 40, budgetMaxTokens: 60000 });
  const contractRecord = await require('../../src/services/strategyContractService').saveContract(db, {
    agentId: ctx.agentId, problem: 'Write a full creative draft and integrate quality evidence.' });
  const source = mission(ctx, { id: 'live-author', role: options.kind || 'literary_author', kind: options.kind, quality, lease });
  const target = mission(ctx, { id: 'live-final', role: options.kind || 'dramaturg', kind: options.kind, quality, lease });
  for (const worker of [source, target]) await addActor(ctx, worker);
  const executionRun = await require('../../src/services/strategyExecutionService').createExecutionRun(db, {
    agentId: source.agentId, missionId: ctx.missionId, contractRecord,
    budget: { tokens: ctx.fixtureBudget, costUsd: 1, latencyMs: 300000 } });
  await require('../../src/services/missionEnvelopeAuthority').seal({ db, agentId: source.agentId,
    normalizedMission: source, executionRun, contractRecord, executable: process.execPath });
  const { result, report } = await qualityResult({ options, quality, kind: source.workerKind });
  report.qualityElevationReceipt = await require('../../src/services/qualityElevation/qualityReceiptService')
    .issueQualityReceipt({ db, worker: source, result, executionRunId: executionRun.id,
      artifact: report.workerArtifact, report });
  await db.run("UPDATE strategy_execution_runs SET status='completed',metrics_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?",
    JSON.stringify({ tokens: result.session.budget.tokens, billableTokens: result.session.budget.tokens }), executionRun.id);
  await db.run("UPDATE agents SET status='completed' WHERE id=?", source.agentId);
  await db.run('INSERT INTO telemetry_events(agent_id,event_type,action,detail,payload_json) VALUES(?,?,?,?,?)',
    source.agentId, 'EVIDENCE_REPORT', 'VALIDATE_EVIDENCE', 'Synthetic quality source for actual native transition.',
    JSON.stringify({ executionRunId: executionRun.id, evidenceReport: report }));
  const formed = await teams.createRun({ db, missionId: ctx.agentId, idempotencyKey: 'live-morph-test',
    goal: 'Integrate a checked creative draft.', qualityElevation: quality,
    qualityRuntime: { finalArtifactMemberId: 'final' }, status: 'RUNNING', phase: 'EXECUTION',
    adaptiveMorphogenesis: options.automatic ? { version: 2, mode: 'automatic', requireTransition: true,
      ...(options.pressureRatio ? { budgetPressureRatio: options.pressureRatio } : {}) } : {
      version: 1, afterMember: 'author', targetMember: 'final', requireTransition: true,
      replacement: { role: 'literary_author', missionAppend: 'Integrate the observed quality repair.' } },
    execution: { organizationPolicy: { variant: 'pipeline' }, runtimeMissionId: ctx.missionId },
    members: [member(source, 'author', []), member(target, 'final', ['author'])] });
  const claimed = await teams.claimExecution({ db, teamRunId: formed.run.teamRunId, ownerId: ctx.agentId });
  const prepared = await require('../../src/services/aTeam/adaptation/liveMorphogenesisPreparation').prepare({
    db, run: claimed.run, parent: { workspace_id: 'morph-ws' } });
  const observed = await require('../../src/services/aTeam/execution/workGraphExecutionService').observeExecution({
    db, run: prepared, plan: { members: prepared.members }, expired: false });
  return { ...ctx, quality, source, target, sourceRunId: executionRun.id, report,
    run: await require('../../src/services/aTeam/teamRunStore').load(db, prepared.teamRunId), observed,
    runnerToken: claimed.token };
}

function mission(ctx, input) {
  return buildWorkerMission({ agentId: input.id, role: input.role, workerKind: input.kind || 'creative_worker',
    orchestratorAgentId: ctx.agentId, missionId: ctx.missionId, prompt: 'Write and revise a complete fiction.',
    workerAssignment: input.kind === 'specialist' ? { specialtyNiche: 'fixture_domain' } : null,
    workspaceId: 'morph-ws', workspaceRoot: ctx.root + '/workspace', timeoutMs: 300000,
    missionExecutionAuthority: input.lease, executionBudget: { tokens: ctx.fixtureBudget, costUsd: 1, latencyMs: 300000 },
    qualityElevation: input.quality });
}

async function addActor(ctx, worker) {
  await ctx.db.run(`INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id,metadata_json)
    VALUES(?,?,?,'idle','worker',?,'morph-ws',?)`, worker.agentId, worker.role, worker.role,
    ctx.agentId, JSON.stringify({ workerKind: worker.workerKind, workerContract: worker.workerContract }));
  await require('../../src/services/missionIdentityService').attachAgent(ctx.db, {
    missionId: ctx.missionId, agentId: worker.agentId, role: worker.role });
}

function member(worker, memberId, dependsOn) {
  return { memberId, workerId: worker.agentId, agentId: worker.agentId,
    domain: memberId, subSystem: memberId, role: worker.role, workerKind: worker.workerKind,
    workerAssignment: worker.workerAssignment,
    dependsOn, mission: worker.prompt, executionBudgetTokens: worker.executionBudget.tokens, status: 'ACTIVE' };
}

module.exports = { create };

async function qualityResult({ options, quality, kind }) {
  const state = { options, kind, calls: 0, report: null };
  const reviewers = options.automatic ? [gqel.reviewer((checks, data) => {
    if (data.artifact.includes('INCOMPLETE')) checks.checks[0].verdict = 'fail';
    return checks;
  })] : [gqel.reviewer()];
  if (options.usageInputTokens) for (const reviewer of reviewers) {
    const original = reviewer.review;
    reviewer.review = async request => ({ ...await original(request),
      usage: { inputTokens: options.usageInputTokens, outputTokens: 20 } });
  }
  const result = await gqel.execute({ contract: quality, planScenes: false, reviewers,
    generator: async () => generated(state) });
  if (!result.promoted) throw Error('Synthetic source quality failed.');
  return { result, report: state.report };
}

function generated(state) {
  const { options, kind } = state;
  const bad = ++state.calls === 1 && !options.noDefect;
  const body = options.automatic ? (bad ? 'INCOMPLETE source dossier.' : 'Complete checked source dossier with supplied facts.')
    : bad ? gqel.BAD : Array(4).fill(gqel.GOOD).join('\n\n');
  const report = state.report = syntheticReport(kind, body);
  return gqel.reply(require('../../src/services/qualityElevation/workerQualityContractEnforcer')
    .extractTargetContent(report, report.workerArtifact), options.usageInputTokens
    ? { usage: { inputTokens: options.usageInputTokens, outputTokens: 20 } } : {});
}

function syntheticReport(kind, body) {
  const type = require('../../src/services/agents/workerKindService').kindDefinition(kind).artifact;
  const contents = { creative_candidate: { candidate: body, assumptions: ['Synthetic fixture.'], falsificationTest: 'Compare rubric.' },
    synthesis_dossier: { synthesis: body, sources: ['mission'], disagreements: [] },
    dossier: { claims: [{ statement: body, evidence: ['mission'] }] } };
  return { outcome: 'success', claims: [{ statement: 'Synthetic controller qualification source.', evidence: ['test://source'] }],
    workerArtifact: { type, content: contents[type], provenance: { sourceRefs: ['mission'] } } };
}
