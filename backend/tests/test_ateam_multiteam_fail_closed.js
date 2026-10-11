'use strict';

const assert = require('node:assert/strict');
const garage = require('../src/services/workerGarageService');
const coordination = require('../src/services/aTeamCoordinationService');
const runStore = require('../src/services/aTeam/teamRunStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const { dispatchTeam } = require('../src/services/aTeamDispatchService');
const { executeTeamRun } = require('../src/services/aTeam/execution/teamExecutionService');

async function run() {
  const previous = { garage: garage.state, compose: coordination.composeTeam,
    load: runStore.load, create: runtime.createRun };
  const members = ['a1', 'a2', 'b1', 'b2'].map((memberId) => ({ memberId, workerId: memberId,
    domain: memberId, role: 'specialist', capabilities: ['analysis'] }));
  const teams = [{ teamId: 'a', members: members.slice(0, 2) },
    { teamId: 'b', members: members.slice(2) }];
  let launches = 0;
  garage.state = async () => ({ available: 4 });
  coordination.composeTeam = () => ({ members, organization: 'specialist_expert_committee',
    readiness: { ready: true, blockers: [] } });
  runStore.load = async () => null;
  try {
    await assert.rejects(dispatchTeam({ db: {}, context: { orchestratorId: 'mission',
      task: 'Coordinate subteams', request: { variant: 'multiteam', teams } },
    parent: {}, launchWorker: async () => { launches++; } }),
    { code: 'ATEAM_MTS_EXECUTOR_REQUIRED' });
    assert.equal(launches, 0);
    let selected;
    coordination.composeTeam = () => ({ members: [members[0], { ...members[1], dependsOn: ['a1'] }],
      organization: 'specialist_expert_committee', readiness: { ready: true, blockers: [] } });
    runtime.createRun = async (input) => {
      selected = input.execution.organizationPolicy;
      return { created: false, run: { teamRunId: 'existing', status: 'COMPLETED', revision: 1 } };
    };
    await dispatchTeam({ db: {}, context: { orchestratorId: 'mission', task: 'Deliver service',
      request: { teamCount: 2 } }, parent: {}, launchWorker: async () => { launches++; } });
    assert.equal(selected.variant, 'project_dag');
    assert.equal(selected.evidence.fallbackFrom, 'multiteam');
    assert.equal(launches, 0);
    runStore.load = async () => ({ teamRunId: 'parent', status: 'RUNNING',
      execution: { organizationPolicy: { variant: 'multiteam' }, runnerLease: {
        token: 'lease', expiresAt: new Date(Date.now() + 60000).toISOString()
      } } });
    await assert.rejects(executeTeamRun({ db: {}, teamRunId: 'parent', runnerToken: 'lease',
      plan: { members: [] }, launch: async () => { launches++; } }),
    { code: 'ATEAM_MTS_EXECUTOR_REQUIRED' });
    assert.equal(launches, 0);
  } finally {
    garage.state = previous.garage;
    coordination.composeTeam = previous.compose;
    runStore.load = previous.load;
    runtime.createRun = previous.create;
  }
  console.log('A-Team multiteam generic dispatch and execution refuse unverified sub-runs.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
