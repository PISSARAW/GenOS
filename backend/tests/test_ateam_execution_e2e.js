'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const runs = require('../src/services/aTeam/teamRunStore');
const graphs = require('../src/services/aTeam/workGraph/workGraphStore');
const sessions = require('../src/services/topologySessionStore');
const scheduler = require('../src/services/aTeamStageScheduler');
const { executeTeamRun } = require('../src/services/aTeam/execution/teamExecutionService');
const { runDependencyGraph } = require('../src/services/aTeam/execution/dependencyExecutionService');

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT); CREATE TABLE telemetry_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, payload_json TEXT);');
  return db;
}

function members() {
  return [
    { subSystem: 'api', role: 'engineer', capabilities: ['api'], outputs: ['api-contract'], acceptanceCriteria: ['tested'],
      outputSchema: { type: 'object', required: ['value'], properties: { value: { type: 'number' } } } },
    { subSystem: 'web', role: 'engineer', capabilities: ['web'], dependsOn: ['api'], outputs: ['site'], inputArtifacts: ['api-contract'] },
    { subSystem: 'quality', role: 'engineer', capabilities: ['quality'], outputs: ['quality-report'] }
  ];
}

async function begin(db, missionId, successCriteria = []) {
  const canonical = await runtime.createRun({ db, missionId, goal: 'Build tested API and site', idempotencyKey: 'request',
    members: members(), successCriteria, requiredCapabilities: ['api', 'web', 'quality'].map((capability) => ({ capability, weight: 1 })), status: 'READY', phase: 'PREBRIEF' });
  const run = await runtime.transitionRun({ db, teamRunId: canonical.run.teamRunId, revision: canonical.run.revision, patch: { status: 'RUNNING', phase: 'EXECUTION' } });
  const lease = await runtime.claimExecution({ db, teamRunId: run.teamRunId });
  const plan = scheduler.stagePlanFor({ orchestratorId: missionId, planId: run.teamRunId, members: run.members });
  for (const member of plan.members) await db.run('INSERT INTO agents VALUES (?, ?)', member.workerId, 'idle');
  return { run: lease.run, plan, token: lease.token };
}

function executeProbe(member) {
  const command = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({value: 6 * 7}))'], { encoding: 'utf8' });
  assert.equal(command.status, 0);
  const output = JSON.parse(command.stdout);
  assert.equal(output.value, 42);
  const evidence = 'process-output:' + member.workerId;
  return { outcome: 'success', output, artifacts: member.outputs,
    tests: [{ passed: true, evidence: [evidence], command: 'node -e 6*7', exitCode: command.status }],
    acceptanceEvaluations: [{ criterion: 'tested', passed: true, evidenceRefs: [evidence] }],
    handoffEvaluations: (member.handoffContext || []).map((handoff) => ({ handoffId: handoff.handoffId, digest: handoff.digest, version: handoff.version, passed: true, evidenceRefs: [evidence] })),
    integrationConstraints: ['Consume only the versioned api-contract.'] };
}

async function publish(db, member, report) {
  await db.run('INSERT INTO telemetry_events (agent_id, event_type, payload_json) VALUES (?, ?, ?)', member.workerId, 'EVIDENCE_REPORT', JSON.stringify(report));
  await db.run('UPDATE agents SET status = ? WHERE id = ?', 'completed', member.workerId);
}

async function scenario(name, mutations = {}, criteria = []) {
  const db = await database();
  try {
    const { run, plan, token } = await begin(db, name, criteria);
    const launched = [];
    const result = await executeTeamRun({ db, teamRunId: run.teamRunId, runnerToken: token, plan,
      launch: async (member) => {
        launched.push(member.subSystem);
        if (member.subSystem === 'web') assert.equal(member.handoffContext[0].producer.agentId, plan.members[0].workerId);
        const report = executeProbe(member);
        await publish(db, member, (mutations[member.subSystem] || ((value) => value))(report));
        return true;
      },
      onBlocked: async (member) => db.run('UPDATE agents SET status = ? WHERE id = ?', 'blocked', member.workerId),
      options: { timeoutMs: 5000, pollMs: 0, now: () => 0 }
    });
    const saved = await runs.load(db, run.teamRunId);
    const graph = await graphs.load(db, run.workGraphId);
    assert.equal(saved.phase, 'DEBRIEF');
    assert.equal(saved.execution.deadlineAt, new Date(5000).toISOString());
    assert.ok(saved.execution.debriefId);
    assert.ok(await sessions.load(db, saved.execution.debriefId));
    return { result, graph, launched, run: saved };
  } finally { await db.close(); }
}

async function testSuccess() {
  const { result, graph, run, launched } = await scenario('success');
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(launched, ['api', 'quality', 'web']);
  assert.ok(graph.nodes.every((node) => node.status === 'SUCCEEDED' && node.evidenceRefs.length));
  assert.equal(run.execution.coverage.ratio, 1);
  assert.equal(graph.edges[0].handoff.status, 'ACCEPTED');
  assert.equal(graph.edges[0].handoff.validation.passed, true);
  for (const dimension of ['missionCoverage', 'staffedCoverage', 'runtimeToolCoverage', 'verifiedCoverage']) {
    assert.equal(result.coverage[dimension].ratio, 1);
    assert.ok(result.coverage[dimension].source);
  }
}

async function testRejectedEvidence() {
  const mutations = [
    (report) => ({ ...report, tests: [{ passed: false }] }),
    (report) => ({ ...report, output: { value: 'invalid' } }),
    (report) => ({ ...report, acceptanceEvaluations: [] }),
    (report) => ({ ...report, outcome: 'unverified' }),
    (report) => ({ ...report, mutations: [{ scope: 'site' }] })
  ];
  for (const [index, mutate] of mutations.entries()) {
    const { result, graph, launched } = await scenario('rejected-' + index, { api: mutate });
    assert.equal(result.accepted, false);
    assert.ok(!launched.includes('web'));
    assert.ok(launched.includes('quality'));
    assert.equal(graph.nodes.find((node) => node.domain === 'web').status, 'BLOCKED');
    assert.equal(graph.nodes.find((node) => node.domain === 'quality').status, 'SUCCEEDED');
  }
}

async function testConsumerReceipt() {
  const mutations = [
    (report) => ({ ...report, handoffEvaluations: [] }),
    (report) => ({ ...report, handoffEvaluations: report.handoffEvaluations.map((item) => ({ ...item, version: item.version + 1 })) }),
    (report) => ({ ...report, handoffEvaluations: report.handoffEvaluations.map((item) => ({ ...item, passed: false })) }),
    (report) => ({ ...report, outcome: 'unverified' })
  ];
  for (const [index, mutate] of mutations.entries()) {
    const outcome = await scenario('receipt-' + index, { web: mutate });
    assert.equal(outcome.result.accepted, false);
    assert.equal(outcome.graph.edges[0].accepted, false);
  }
}

async function testChangedHandoff() {
  const db = await database();
  try {
    const { run, plan, token } = await begin(db, 'changed-handoff');
    let producerReport;
    const result = await executeTeamRun({ db, teamRunId: run.teamRunId, runnerToken: token, plan,
      launch: async (member) => {
        const report = executeProbe(member);
        if (member.subSystem === 'api') producerReport = report;
        if (member.subSystem === 'web') await publish(db, plan.members[0], { ...producerReport, output: { value: 43 } });
        await publish(db, member, report);
        return true;
      }, options: { timeoutMs: 5000, now: () => 0, pollMs: 0 } });
    assert.equal(result.accepted, false);
    const graph = await graphs.load(db, run.workGraphId);
    assert.equal(graph.edges[0].handoff.version, 2);
    assert.equal(graph.edges[0].accepted, false);
  } finally { await db.close(); }
}

async function testLeaseAndTimeout() {
  const db = await database();
  try {
    const { run, plan, token } = await begin(db, 'timeout');
    const { assertLease } = require('../src/services/aTeam/execution/teamExecutionService');
    for (const expiresAt of ['invalid', new Date(0).toISOString()]) {
      assert.throws(() => assertLease({ ...run, execution: { ...run.execution, runnerLease: { token, expiresAt } } }, token), { code: 'ATEAM_RUN_LEASE_LOST' });
    }
    await assert.rejects(executeTeamRun({ db, teamRunId: run.teamRunId, plan, runnerToken: 'stale', launch: () => assert.fail('stale runner launched') }), { code: 'ATEAM_RUN_LEASE_LOST' });
    for (const member of plan.members) await db.run('UPDATE agents SET status = ? WHERE id = ?', 'running', member.workerId);
    const result = await executeTeamRun({ db, teamRunId: run.teamRunId, plan, runnerToken: token,
      launch: () => assert.fail('resumed worker relaunched'), options: { timeoutMs: 0, skipWorkerIds: plan.members.map((member) => member.workerId) } });
    assert.equal(result.accepted, false);
    const graph = await graphs.load(db, run.workGraphId);
    assert.equal(graph.nodes.find((node) => node.domain === 'api').status, 'TIMED_OUT');
    assert.equal(graph.nodes.find((node) => node.domain === 'web').status, 'BLOCKED');
  } finally { await db.close(); }
}

async function testMissionCriteria() {
  const rejected = await scenario('missing-mission-criterion', {}, ['unobserved']);
  assert.equal(rejected.result.accepted, false);
  assert.ok(rejected.graph.nodes.every((node) => node.status === 'SUCCEEDED'));
  const accepted = await scenario('verified-mission-criterion', {}, ['tested']);
  assert.equal(accepted.result.accepted, true);
}

async function testIndependentProgress() {
  const plan = scheduler.stagePlanFor({ orchestratorId: 'independent', members: [
    { subSystem: 'slow', workerId: 'slow' }, { subSystem: 'fast', workerId: 'fast' },
    { subSystem: 'slow-consumer', workerId: 's', dependsOn: ['slow'] },
    { subSystem: 'fast-consumer', workerId: 'f', dependsOn: ['fast'] }
  ] });
  let clock = 0;
  const launched = [];
  await runDependencyGraph({ plan, db: { get: async (_sql, id) => ({ status: id === 'fast' ? 'completed' : 'running' }) },
    launch: async (member) => { launched.push({ id: member.workerId, at: clock }); },
    options: { skipWorkerIds: ['slow', 'fast'], now: () => clock, sleep: async () => { clock += 10; }, timeoutMs: 20 } });
  assert.deepEqual(launched, [{ id: 'f', at: 0 }]);
}

async function testAutonomousExecution() {
  const { assignedWorkerId } = require('../src/services/agentFleetWorkers');
  assert.equal(assignedWorkerId({ workerId: 'canonical-worker' }, { teamRunId: 'run', orchestratorId: 'root', index: 0 }), 'canonical-worker');
  assert.match(assignedWorkerId({ workerId: 'ignored' }, { orchestratorId: 'root', index: 0 }), /^worker_root_1_[a-f0-9-]+$/);
  const db = await database();
  try {
    const { run, plan, token } = await begin(db, 'autonomous');
    await runtime.releaseExecution({ db, teamRunId: run.teamRunId, token });
    const launched = [];
    const result = await require('../src/services/aTeam/aTeamAutonomousExecutionService').executeAutonomousTeam({
      db, agentId: run.missionId, autonomyPlan: { aTeam: { activated: true, teamRun: run } },
      workers: plan.members.map((member) => ({ ...member, agentId: member.workerId, prompt: 'Execute owned work.' })),
      reserveSlot: async () => {}, timeoutMs: 5000, options: { now: () => 0, pollMs: 0 },
      startMission: async (member) => { launched.push(member.subSystem); await publish(db, member, executeProbe(member)); },
      markBlocked: async (id) => db.run('UPDATE agents SET status = ? WHERE id = ?', 'blocked', id)
    });
    assert.equal(result.accepted, true);
    assert.deepEqual(launched, ['api', 'quality', 'web']);
  } finally { await db.close(); }
}

async function main() {
  await testSuccess();
  await testRejectedEvidence();
  await testLeaseAndTimeout();
  await testIndependentProgress();
  await testMissionCriteria();
  await testConsumerReceipt();
  await testChangedHandoff();
  await testAutonomousExecution();
  console.log('A-Team execution: SQLite, executable probes, promotion, receipts, independent progress, stale lease and timeout passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
