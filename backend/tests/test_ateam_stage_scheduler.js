const assert = require('node:assert/strict');
const scheduler = require('../src/services/aTeamStageScheduler');
const coordination = require('../src/services/aTeamCoordinationService');

const members = [
  { subSystem: 'frontend', role: 'frontend_specialist', modelTier: 'standard', mission: 'm1', dependsOn: [], pipelineStage: 0 },
  { subSystem: 'backend', role: 'backend_specialist', modelTier: 'standard', mission: 'm2', dependsOn: [], pipelineStage: 0 },
  { subSystem: 'integration', role: 'integration_specialist', modelTier: 'standard', mission: 'm3', dependsOn: ['frontend', 'backend'], pipelineStage: 1 }
];

// Deterministic ids shared by the launcher and the runner.
const plan = scheduler.stagePlanFor({ orchestratorId: 'orch-1', members, planId: 'plan-x' });
assert.equal(plan.maxStage, 1);
assert.deepEqual(plan.members.map((member) => member.workerId), ['worker_orch-1_plan-x_0', 'worker_orch-1_plan-x_1', 'worker_orch-1_plan-x_2']);
const again = scheduler.stagePlanFor({ orchestratorId: 'orch-1', members, planId: 'plan-x' });
assert.deepEqual(again.members.map((member) => member.workerId), plan.members.map((member) => member.workerId));

function fakeDb(statuses) {
  return { get: async (sql, id) => (id in statuses ? { status: statuses[id] } : undefined) };
}

(async () => {
  // Producers complete while the scheduler polls; the consumer launches after.
  const statuses = { 'w-front': 'running', 'w-back': 'running' };
  const launchOrder = [];
  const statusAtLaunch = {};
  let sleeps = 0;
  const sleep = async () => { sleeps += 1; statuses['w-front'] = 'completed'; statuses['w-back'] = 'completed'; };
  const ordered = scheduler.stagePlanFor({ orchestratorId: 'o', planId: 'p', members: [
    { subSystem: 'frontend', mission: 'm1', dependsOn: [], pipelineStage: 0, workerId: 'w-front' },
    { subSystem: 'backend', mission: 'm2', dependsOn: [], pipelineStage: 0, workerId: 'w-back' },
    { subSystem: 'integration', mission: 'm3', dependsOn: ['frontend', 'backend'], pipelineStage: 1, workerId: 'w-integ' }
  ] });
  const results = await scheduler.runStagePlan({
    db: fakeDb(statuses),
    plan: ordered,
    launch: async (member) => { launchOrder.push(member.workerId); statusAtLaunch[member.workerId] = { ...statuses }; },
    options: { sleep, pollMs: 0, timeoutMs: 1000 }
  });
  assert.deepEqual(launchOrder, ['w-front', 'w-back', 'w-integ']);
  assert.equal(statusAtLaunch['w-integ']['w-front'], 'completed');
  assert.equal(statusAtLaunch['w-integ']['w-back'], 'completed');
  assert.equal(sleeps >= 1, true);
  assert.equal(results.some((entry) => entry.timedOut), false);

  // A dependency that never terminates must block its consumer stage.
  const blocked = { 'w-front': 'running', 'w-back': 'running' };
  const blockedLaunches = [];
  const blockedResults = await scheduler.runStagePlan({
    db: fakeDb(blocked),
    plan: ordered,
    launch: async (member) => blockedLaunches.push(member.workerId),
    options: { sleep: async () => {}, pollMs: 0, timeoutMs: 0 }
  });
  assert.equal(blockedLaunches.includes('w-integ'), false);
  assert.equal(blockedResults.some((entry) => entry.timedOut === true), true);
  assert.equal(blockedResults.some((entry) => entry.reason === 'dependency_timeout'), true);

  const failedStatuses = { 'w-front': 'failed', 'w-back': 'completed' };
  const failedLaunches = [];
  const failedResults = await scheduler.runStagePlan({
    db: fakeDb(failedStatuses), plan: ordered,
    launch: async (member) => failedLaunches.push(member.workerId),
    options: { sleep: async () => {}, pollMs: 1, timeoutMs: 100 }
  });
  assert.equal(failedLaunches.includes('w-integ'), false);
  assert.equal(failedResults.some((entry) => entry.reason === 'dependency_failed'), true);

  const invalid = scheduler.stagePlanFor({ orchestratorId: 'o', planId: 'invalid', members: [
    { subSystem: 'integration', mission: 'm', dependsOn: ['missing'], pipelineStage: 1, workerId: 'w-invalid' }
  ] });
  const invalidLaunches = [];
  const invalidResults = await scheduler.runStagePlan({
    db: fakeDb({}), plan: invalid, launch: async (member) => invalidLaunches.push(member.workerId)
  });
  assert.deepEqual(invalidLaunches, []);
  assert.equal(invalidResults[0].reason, 'invalid_dependencies');

  // Payload carries the dependency metadata to the worker.
  const payload = scheduler.workerLaunchPayload({ plan, member: plan.members[2], parentWorkspaceRoot: 'C:/ws', request: { timeoutMs: 1000 } });
  assert.equal(payload.action, 'dispatch_worker');
  assert.equal(payload.workerId, 'worker_orch-1_plan-x_2');
  assert.deepEqual(payload.depends_on, ['frontend', 'backend']);
  assert.equal(payload.pipeline_stage, 1);

  const handoffPlan = { ...plan, handoffs: [coordination.buildHandoff('frontend', 'integration', 1)] };
  const handedOff = scheduler.workerLaunchPayload({ plan: handoffPlan, member: plan.members[2] });
  assert.equal(handedOff.handoff_signals.length, 1);
  assert.match(handedOff.mission, /Validated dependency handoffs: handoff:frontend->integration/);
  assert.throws(() => scheduler.workerLaunchPayload({
    plan: { ...handoffPlan, handoffs: [{ to: 'integration', ligand: 'invalid', concentration: 1, content: 'handoff:invalid', receptor: { targetLigand: 'other', threshold: 1 } }] },
    member: plan.members[2]
  }), (error) => error.code === 'A_TEAM_INVALID_HANDOFF');

  console.log('A-Team stage scheduler blocks consumers until producers are terminal.');
})().catch((error) => { console.error(error); process.exit(1); });
