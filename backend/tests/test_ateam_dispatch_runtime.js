'use strict';

const assert = require('node:assert/strict');
const garage = require('../src/services/workerGarageService');
const coordination = require('../src/services/aTeamCoordinationService');
const scheduler = require('../src/services/aTeamStageScheduler');
const teamService = require('../src/services/aTeamService');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const { dispatchTeam } = require('../src/services/aTeamDispatchService');

async function run() {
  const originals = { garage: garage.state, compose: coordination.composeTeam, stage: scheduler.stagePlanFor, planStages: teamService.planStages, create: runtime.createRun, transition: runtime.transitionRun };
  let createCount = 0;
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
  try {
    const context = { orchestratorId: 'mission-dispatch', task: 'Build API', repoRoot: process.cwd(), request: {} };
    const first = await dispatchTeam({ db: {}, context, parent: { workspace_root: process.cwd() }, launchWorker: () => { launches += 1; return { workerId: 'worker-a' }; } });
    assert.equal(first.aTeam.teamRunId, 'run-stable');
    assert.equal(first.aTeam.workGraphId, 'graph-stable');
    assert.equal(launches, 1);
    const second = await dispatchTeam({ db: {}, context, parent: { workspace_root: process.cwd() }, launchWorker: () => { launches += 1; } });
    assert.equal(second.aTeam.reused, true);
    assert.equal(launches, 1);
  } finally {
    garage.state = originals.garage;
    coordination.composeTeam = originals.compose;
    scheduler.stagePlanFor = originals.stage;
    teamService.planStages = originals.planStages;
    runtime.createRun = originals.create;
    runtime.transitionRun = originals.transition;
  }
  console.log('A-Team dispatch persists one canonical run and does not duplicate a retry.');
}

function runtimeSnapshotRun() {
  return { teamRunId: 'run-stable', workGraphId: 'graph-stable', status: 'READY', phase: 'PREBRIEF', members: [{ workerId: 'worker-a', memberId: 'member-a', subSystem: 'api', pipelineStage: 0 }] };
}

run().catch((error) => { console.error(error); process.exit(1); });
