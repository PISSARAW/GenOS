'use strict';

const assert = require('node:assert/strict');
const { executeForegroundTeam, terminalFailure } = require('../src/services/aTeamDispatchService');

const failure = terminalFailure({ teamRunId: 'team-run-1', status: 'BLOCKED', accepted: false });
assert.equal(failure.code, 'A_TEAM_TERMINAL_FAILURE');
assert.equal(failure.teamRunId, 'team-run-1');
assert.equal(failure.terminal.status, 'BLOCKED');

let executeInput;
let launched;
const context = { request: { background: false, timeoutMs: 1234 }, executeAteamRun: async (input) => {
  executeInput = input;
  await input.launch(input.plan.members[1]);
  return { teamRunId: 'team-run-1', status: 'COMPLETED', accepted: true };
} };
const plan = { planId: 'team-run-1', members: [
  { workerId: 'producer', pipelineStage: 0, index: 0 },
  { workerId: 'consumer', pipelineStage: 1, index: 1 }
] };

executeForegroundTeam({
  context,
  setup: { db: { run: async () => {} } },
  activeRun: { teamRunId: 'team-run-1' },
  runnerToken: 'lease-1',
  parent: { workspace_root: process.cwd() },
  plan,
  existingWorkerIds: new Set(),
  launchWorker: async (input) => { launched = input; return true; }
}).then((terminal) => {
  assert.equal(terminal.status, 'COMPLETED');
  assert.deepEqual(executeInput.options.skipWorkerIds, ['producer']);
  assert.equal(executeInput.options.timeoutMs, 1234);
  assert.equal(launched.suppliedWorkerId, 'consumer');
  console.log('A-Team terminal wait contract: PASS');
}).catch((error) => { console.error(error); process.exitCode = 1; });
