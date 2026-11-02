'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const runs = require('../src/services/aTeam/teamRunStore');
const graphs = require('../src/services/aTeam/workGraph/workGraphStore');
const scheduler = require('../src/services/aTeamStageScheduler');
const { executeTeamRun } = require('../src/services/aTeam/execution/teamExecutionService');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const { digest } = require('../src/services/qualityElevation/qualityContract');

function quality() {
  return compileQualityContract({ mission: 'Produce the scoped artifact.', domain: 'generic',
    policy: 'fast', maxStrategyMutations: 1 });
}

async function begin(consumerQuality = false) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT); CREATE TABLE telemetry_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, payload_json TEXT);');
  const canonical = await runtime.createRun({ db, missionId: 'quality-team', goal: 'Deliver verified scoped output',
    members: [{ subSystem: 'author', role: 'engineer', outputs: ['candidate'], capabilities: ['author'],
      acceptanceCriteria: ['brief_coverage'], qualityElevation: quality(),
      qualityRuntime: { reviewers: [{ id: 'reader', model: 'test-reader' }] },
      modelBudgetScope: { id: 'team-budget', costUsd: 1, tokens: 10000 } },
    { subSystem: 'consumer', role: 'engineer', outputs: ['delivery'], capabilities: ['consumer'],
      dependsOn: ['author'], inputArtifacts: ['candidate'], ...(consumerQuality ? {
        acceptanceCriteria: ['brief_coverage'], qualityElevation: quality() } : {}) }], requiredCapabilities: [
      { capability: 'author', weight: 1 }, { capability: 'consumer', weight: 1 }], status: 'READY', phase: 'PREBRIEF' });
  let run = await runtime.transitionRun({ db, teamRunId: canonical.run.teamRunId, revision: canonical.run.revision,
    patch: { status: 'RUNNING', phase: 'EXECUTION' } });
  const claimed = await runtime.claimExecution({ db, teamRunId: run.teamRunId });
  run = claimed.run;
  const plan = scheduler.stagePlanFor({ orchestratorId: run.missionId, planId: run.teamRunId, members: run.members });
  for (const member of plan.members) await db.run('INSERT INTO agents VALUES (?, ?)', member.workerId, 'idle');
  return { db, run, plan, token: claimed.token };
}

function report(member, version = 1, accepted = true) {
  const probe = spawnSync(process.execPath, ['-e', `process.stdout.write(String(${version} * 21))`], { encoding: 'utf8' });
  assert.equal(probe.status, 0);
  const evidence = `process:${member.workerId}:${version}`;
  return { outcome: 'success', output: probe.stdout, artifacts: member.outputs,
    tests: [{ passed: true, evidence: [evidence], exitCode: probe.status }],
    acceptanceEvaluations: [{ criterion: 'brief_coverage', passed: accepted, evidenceRefs: [evidence] }],
    integrationConstraints: ['Consume the accepted candidate version only.'],
    handoffEvaluations: (member.handoffContext || []).map((handoff) => ({
      handoffId: handoff.handoffId, digest: handoff.digest, version: handoff.version, passed: true, evidenceRefs: [evidence] })) };
}

async function publish(db, member, value) {
  await db.run('INSERT INTO telemetry_events (agent_id, event_type, payload_json) VALUES (?, ?, ?)',
    member.workerId, 'EVIDENCE_REPORT', JSON.stringify(value));
  await db.run('UPDATE agents SET status = ? WHERE id = ?', 'completed', member.workerId);
}

async function scenario(mode) {
  const context = await begin(), launches = [];
  let pending = null, clock = 0;
  const { db, run, plan, token } = context;
  const original = plan.members[0];
  try {
    const result = await executeTeamRun({ db, teamRunId: run.teamRunId, plan, runnerToken: token,
      launch: async (member) => {
        launches.push(member);
        if (member.qualityRepair) {
          assert.equal(member.qualityRepair.attempt, 1);
          assert.equal(member.qualityElevation.digest, original.qualityElevation.digest);
          assert.deepEqual(member.modelBudgetScope, original.modelBudgetScope);
          if (mode === 'budget') throw Object.assign(new Error('shared budget exhausted'), { code: 'GQEL_TOKEN_BUDGET' });
          const version = mode === 'stagnant' ? 1 : 2;
          pending = { member, value: report(member, version, mode !== 'exhausted') };
          if (mode === 'stagnant') pending.value.artifacts = [...member.outputs, 'new-report-marker'];
          return true;
        }
        if (member.subSystem === 'consumer') assert.equal(pending, null, 'consumer released before fresh evidence');
        const value = report(member, 1, member.subSystem !== 'author');
        if (mode === 'authority' && member.subSystem === 'author') {
          await publishNativeFailure(db, member);
          return true;
        }
        await publish(db, member, value);
        return true;
      }, onBlocked: async (member) => db.run('UPDATE agents SET status = ? WHERE id = ?', 'blocked', member.workerId),
      options: { timeoutMs: 100, pollMs: 0, now: () => clock, sleep: async () => {
        clock++;
        if (pending) { const next = pending; pending = null; await publish(db, next.member, next.value); }
      } } });
    const saved = await runs.load(db, run.teamRunId);
    const graph = await graphs.load(db, run.workGraphId);
    return { result, saved, graph, launches };
  } finally { await db.close(); }
}

async function publishNativeFailure(db, member) {
  const { failurePayload } = require('../src/services/workerEvidenceBarrierLocalFailure');
  const error = { qualityFeedback: { finalStatus: 'needs_review',
    terminalError: { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' } } };
  const payload = failurePayload({ mission: { agentId: member.workerId }, executionRun: { id: 'failed-run' }, error });
  await db.run('INSERT INTO telemetry_events (agent_id, event_type, payload_json) VALUES (?, ?, ?)',
    member.workerId, 'AGENT_HALTED', JSON.stringify(payload));
  await db.run('UPDATE agents SET status = ? WHERE id = ?', 'blocked', member.workerId);
}

async function success() {
  const { result, saved, graph, launches } = await scenario('success');
  assert.equal(result.accepted, true);
  assert.equal(launches.filter((member) => member.qualityRepair).length, 1);
  assert.deepEqual(launches.map((member) => member.subSystem), ['author', 'author', 'consumer']);
  assert.equal(result.qualityFeedback[0].status, 'resolved');
  assert.equal(saved.execution.qualityRepairs[launches[0].workerId].status, 'resolved');
  assert.equal(graph.edges[0].handoff.artifactPayload, '42');
  assert.equal(graph.edges[0].accepted, true);
}

async function failures() {
  for (const [mode, status, category] of [['stagnant', 'stagnated', 'quality'],
    ['exhausted', 'exhausted', 'budget'], ['budget', 'blocked', 'budget'], ['authority', 'needs_review', 'authority']]) {
    const { result, graph, launches } = await scenario(mode);
    assert.equal(result.accepted, false, mode);
    assert.equal(launches.some((member) => member.subSystem === 'consumer'), false, mode);
    assert.equal(result.qualityFeedback[0].status, status, mode);
    assert.equal(result.qualityFeedback[0].category, category, mode);
    assert.equal(graph.edges[0].accepted, false, mode);
    if (mode === 'authority') assert.equal(launches.length, 1);
  }
}

async function contractIdentity() {
  const { db, run, plan, token } = await begin();
  try {
    const changed = compileQualityContract({ mission: 'Different obligation', domain: 'generic', policy: 'fast' });
    plan.members[0].qualityElevation = changed;
    await assert.rejects(executeTeamRun({ db, teamRunId: run.teamRunId, plan, runnerToken: token,
      launch: async () => assert.fail('changed contract launched'), options: { timeoutMs: 0 } }), { code: 'GQEL_CONTRACT_CHANGED' });
    const launch = scheduler.workerLaunchPayload({ plan, member: run.members[0] });
    assert.equal(launch.qualityElevation.digest, run.members[0].qualityElevation.digest);
    assert.equal(digest(launch.qualityRuntime), digest(run.members[0].qualityRuntime));
  } finally { await db.close(); }
}

async function cancellation() {
  const { db, run, plan, token } = await begin();
  let cancelled = false, launches = 0;
  try {
    await assert.rejects(executeTeamRun({ db, teamRunId: run.teamRunId, plan, runnerToken: token,
      launch: async (member) => { launches++; await publish(db, member, report(member, 1, false)); cancelled = true; },
      options: { timeoutMs: 100, now: () => 0, onTick: () => {
        if (cancelled) throw Object.assign(new Error('cancelled'), { code: 'WORKER_BARRIER_CANCELLED' });
      } } }), { code: 'WORKER_BARRIER_CANCELLED' });
    assert.equal(launches, 1);
  } finally { await db.close(); }
}

function nativeFeedback() {
  const { terminalFeedback } = require('../src/services/aTeam/execution/teamQualityRepairPolicy');
  assert.equal(terminalFeedback({ qualityElevation: { qualitySatisfied: true, finalStatus: 'promoted' } }), null);
  assert.equal(terminalFeedback({ qualityFeedback: { promoted: true, finalStatus: 'promoted' } }), null);
  assert.equal(terminalFeedback({ qualityFeedback: { qualitySatisfied: false, finalStatus: 'promoted' } }).status, 'needs_review');
  assert.equal(terminalFeedback({ qualityFeedback: { qualitySatisfied: true, finalStatus: 'unknown' } }).status, 'needs_review');
  assert.equal(terminalFeedback({ qualityFeedback: { promoted: true, finalStatus: 'unknown' } }).status, 'needs_review');
}

async function freshRepairHandoff() {
  const { observeExecution } = require('../src/services/aTeam/execution/workGraphExecutionService');
  const { db, run, plan, token } = await begin(true);
  const input = { db, run, plan, runnerToken: token, expired: false };
  try {
    await publish(db, plan.members[0], report(plan.members[0], 1, true));
    await publish(db, plan.members[1], report(plan.members[1], 1, false));
    const old = await observeExecution(input);
    assert.equal(old.graph.edges[0].handoff.artifactPayload, '21');
    await publish(db, plan.members[0], report(plan.members[0], 2, true));
    let repaired;
    await observeExecution({ ...input, launch: async member => { repaired = member; return true; } });
    assert.equal(repaired.subSystem, 'consumer');
    assert.equal(repaired.handoffContext[0].artifactPayload, '42');
    assert.equal(repaired.handoffContext[0].version, 2);
  } finally { await db.close(); }
}

async function main() {
  nativeFeedback(); await success(); await failures(); await contractIdentity(); await cancellation(); await freshRepairHandoff();
  console.log('A-Team GQEL coordination: delayed fresh evidence, unchanged artifact, budgets, authority, cancellation and immutable contracts passed. Model responses are synthetic; subprocess probes execute.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
