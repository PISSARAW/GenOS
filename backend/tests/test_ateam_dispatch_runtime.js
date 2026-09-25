'use strict';

const assert = require('node:assert/strict');
const garage = require('../src/services/workerGarageService');
const coordination = require('../src/services/aTeamCoordinationService');
const scheduler = require('../src/services/aTeamStageScheduler');
const teamService = require('../src/services/aTeamService');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const { dispatchTeam } = require('../src/services/aTeamDispatchService');

async function run() {
  const originals = { garage: garage.state, compose: coordination.composeTeam, stage: scheduler.stagePlanFor, planStages: teamService.planStages, create: runtime.createRun, transition: runtime.transitionRun, claim: runtime.claimExecution, release: runtime.releaseExecution };
  let createCount = 0;
  let claimCount = 0;
  let launches = 0;
  garage.state = async () => ({ available: 2 });
  coordination.composeTeam = () => ({
    members: [{ workerId: 'worker-a', memberId: 'member-a', subSystem: 'api', pipelineStage: 0 }],
    organization: 'specialist_expert_committee',
    teamContract: { version: 1, contractHash: 'hash' }, readiness: { ready: true, blockers: [] },
    capabilityContract: { required: [{ capability: 'api' }] }, capabilityAudit: { missing: [] }, handoffs: []
  });
  scheduler.stagePlanFor = ({ members, planId }) => ({ planId, members, maxStage: 0 });
  teamService.planStages = () => ({ stages: [] });
  runtime.createRun = async () => {
    createCount += 1;
    return { created: createCount === 1, run: { teamRunId: 'run-stable', workGraphId: 'graph-stable', revision: createCount - 1, status: createCount === 1 ? 'READY' : 'RUNNING', members: [{ workerId: 'worker-a', memberId: 'member-a', subSystem: 'api', pipelineStage: 0 }] } };
  };
  runtime.transitionRun = async (input) => ({ ...runtimeSnapshotRun(), status: input.patch.status, phase: input.patch.phase, revision: input.revision + 1 });
  runtime.claimExecution = async () => {
    claimCount += 1;
    const run = runtimeSnapshotRun();
    run.status = 'RUNNING';
    return claimCount === 2 ? { claimed: false, run } : { claimed: true, token: `lease-${claimCount}`, run };
  };
  runtime.releaseExecution = async () => true;
  try {
    const context = { orchestratorId: 'mission-dispatch', task: 'Build API', repoRoot: process.cwd(), request: {} };
    const agents = new Map();
    const db = {
      get: async (_sql, id) => agents.get(id) || (createCount >= 3 ? { id, status: 'idle' } : null),
      run: async (_sql, ...values) => {
        const [id, name, role, workspaceId, modelTier, isolationMode, parentId, about, currentTask, metadataJson] = values;
        agents.set(id, { id, name, role, workspace_id: workspaceId, model_tier: modelTier, isolation_mode: isolationMode, parent_agent_id: parentId, about, current_task: currentTask, metadata_json: metadataJson, status: 'idle', execution_mode: 'worker' });
        return { changes: 1 };
      }
    };
    const launch = () => { launches += 1; agents.get('worker-a').status = 'running'; return { workerId: 'worker-a' }; };
    const first = await dispatchTeam({ db, context, parent: { workspace_root: process.cwd() }, launchWorker: launch });
    assert.equal(first.aTeam.teamRunId, 'run-stable');
    assert.equal(first.aTeam.workGraphId, 'graph-stable');
    assert.equal(launches, 1);
    assert.equal(agents.get('worker-a').parent_agent_id, context.orchestratorId);
    const second = await dispatchTeam({ db, context, parent: { workspace_root: process.cwd() }, launchWorker: launch });
    assert.equal(second.aTeam.reused, true);
    assert.equal(launches, 1);
    const resumed = await dispatchTeam({ db, context, parent: { workspace_root: process.cwd() }, launchWorker: launch });
    assert.equal(resumed.aTeam.teamRunId, 'run-stable');
    assert.equal(launches, 1);
  } finally {
    garage.state = originals.garage;
    coordination.composeTeam = originals.compose;
    scheduler.stagePlanFor = originals.stage;
    teamService.planStages = originals.planStages;
    runtime.createRun = originals.create;
    runtime.transitionRun = originals.transition;
    runtime.claimExecution = originals.claim;
    runtime.releaseExecution = originals.release;
  }
  const payload = scheduler.workerLaunchPayload({
    plan: { orchestratorId: 'mission-dispatch' },
    member: { workerId: 'worker-a', role: 'api', mission: 'Build API', dependsOn: [], pipelineStage: 1 },
    request: { executor: 'local' }
  });
  assert.equal(payload.reuseWorkerId, 'worker-a');
  assert.equal(payload.executor, 'local');
  console.log('A-Team dispatch persists one canonical run and does not duplicate a retry.');
}

function runtimeSnapshotRun() {
  return { teamRunId: 'run-stable', workGraphId: 'graph-stable', status: 'READY', phase: 'PREBRIEF', members: [{ workerId: 'worker-a', memberId: 'member-a', subSystem: 'api', pipelineStage: 0 }] };
}

run().catch((error) => { console.error(error); process.exit(1); });
