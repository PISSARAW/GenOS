'use strict';
const base = require('./missionProtocolsMorphFixture');
const gqel = require('./gqelProgressFixture.cjs');
const { buildWorkerMission } = require('../../src/services/orchestratorDispatchService');
const teams = require('../../src/services/aTeam/aTeamRuntime');

async function create() {
  const ctx = await base.create();
  try { return await setup(ctx); }
  catch (error) { await ctx.close(); throw error; }
}

async function setup(ctx) {
  const { db } = ctx;
  const lease = await require('../../src/services/missionIdentityService').attachOrchestrator(db, {
    missionId: ctx.missionId, agentId: ctx.agentId });
  const quality = gqel.contract({ maxIterations: 2, minBodyWords: 40, budgetMaxTokens: 60000 });
  const contractRecord = await require('../../src/services/strategyContractService').saveContract(db, {
    agentId: ctx.agentId, problem: 'Write a full creative draft and integrate quality evidence.' });
  const source = mission(ctx, { id: 'live-author', role: 'literary_author', quality, lease });
  const target = mission(ctx, { id: 'live-final', role: 'dramaturg', quality, lease });
  for (const worker of [source, target]) await addActor(ctx, worker);
  const executionRun = await require('../../src/services/strategyExecutionService').createExecutionRun(db, {
    agentId: source.agentId, missionId: ctx.missionId, contractRecord,
    budget: { tokens: 10000, costUsd: 1, latencyMs: 300000 } });
  await require('../../src/services/missionEnvelopeAuthority').seal({ db, agentId: source.agentId,
    normalizedMission: source, executionRun, contractRecord, executable: process.execPath });
  let calls = 0;
  const result = await gqel.execute({ contract: quality, planScenes: false,
    generator: async () => gqel.reply(++calls === 1 ? gqel.BAD : Array(4).fill(gqel.GOOD).join('\n\n')) });
  if (!result.promoted || result.session.versions.length !== 2) throw Error('Synthetic quality source did not exercise a genuine repair.');
  const report = { outcome: 'success', claims: [{ statement: 'Synthetic draft generated for controller qualification.', evidence: ['test://source'] }],
    workerArtifact: { type: 'creative_candidate', content: { candidate: result.bestVersion.content,
      assumptions: ['Synthetic qualification data.'], falsificationTest: 'Compare to the declared rubric.' },
    provenance: { sourceRefs: ['mission'] } } };
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
    adaptiveMorphogenesis: { version: 1, afterMember: 'author', targetMember: 'final', requireTransition: true,
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
  return buildWorkerMission({ agentId: input.id, role: input.role, workerKind: 'creative_worker',
    orchestratorAgentId: ctx.agentId, missionId: ctx.missionId, prompt: 'Write and revise a complete fiction.',
    workspaceId: 'morph-ws', workspaceRoot: ctx.root + '/workspace', timeoutMs: 300000,
    missionExecutionAuthority: input.lease, executionBudget: { tokens: 10000, costUsd: 1, latencyMs: 300000 },
    qualityElevation: input.quality });
}

async function addActor(ctx, worker) {
  await ctx.db.run(`INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id,metadata_json)
    VALUES(?,?,?,'idle','worker',?,'morph-ws',?)`, worker.agentId, worker.role, worker.role,
    ctx.agentId, JSON.stringify({ workerKind: 'creative_worker', workerContract: worker.workerContract }));
  await require('../../src/services/missionIdentityService').attachAgent(ctx.db, {
    missionId: ctx.missionId, agentId: worker.agentId, role: worker.role });
}

function member(worker, memberId, dependsOn) {
  return { memberId, workerId: worker.agentId, agentId: worker.agentId,
    domain: memberId, subSystem: memberId, role: worker.role, workerKind: 'creative_worker',
    dependsOn, mission: worker.prompt, executionBudgetTokens: 10000, status: 'ACTIVE' };
}

module.exports = { create };
