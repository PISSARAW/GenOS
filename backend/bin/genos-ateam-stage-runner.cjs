#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const transport = require('./detachedSpawn.cjs');
const scheduler = require('../src/services/aTeamStageScheduler');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const runs = require('../src/services/aTeam/teamRunStore');
const { executeTeamRun, assertLease } = require('../src/services/aTeam/execution/teamExecutionService');
const { emit, updateAgent } = require('../src/services/agentOrchestrationState');

function parseArgs(argv) {
  try { return JSON.parse(transport.loadArgv(argv) || argv[2] || '{}'); }
  catch (error) { throw new Error('Invalid stage-runner payload: ' + error.message); }
}

async function launchWorker(input) {
  const payload = scheduler.workerLaunchPayload(input);
  const output = transport.openRunnerStdio(input.member.workerId);
  try {
    const child = spawn(process.execPath, [input.bridgePath, ...transport.toSpawnArgs(JSON.stringify(payload))], {
      cwd: input.repoRoot || process.cwd(), detached: true, windowsHide: true, stdio: output.stdio
    });
    await transport.waitForSpawn(child);
    child.unref();
    return true;
  } finally { output.close(); }
}

async function main() {
  const payload = parseArgs(process.argv);
  if (!payload.teamRunId || !payload.runnerToken || !payload.bridgePath) throw new Error('Stage runner requires a canonical run, runner lease and bridgePath.');
  const db = await getDatabase();
  try {
    const run = await runs.load(db, payload.teamRunId);
    assertLease(run, payload.runnerToken);
    const plan = scheduler.stagePlanFor({ orchestratorId: run.missionId, planId: run.teamRunId, members: run.members });
    const result = await executeTeamRun({
      db, teamRunId: run.teamRunId, runnerToken: payload.runnerToken, plan,
      launch: (member) => launchWorker({ ...payload, plan, member }),
      onBlocked: (member, reason) => updateAgent(member.workerId, 'blocked', JSON.stringify(reason)),
      options: { skipWorkerIds: payload.skipWorkerIds || [], pollMs: payload.pollMs, timeoutMs: payload.timeoutMs }
    });
    emit(run.missionId, result.accepted ? 'A_TEAM_STAGES_COMPLETED' : 'A_TEAM_STAGES_FAILED',
      'VALIDATE_INTEGRATION', 'A-Team run finished: ' + result.status, result, result.accepted ? 'info' : 'warning');
  } finally {
    await runtime.releaseExecution({ db, teamRunId: payload.teamRunId, token: payload.runnerToken });
  }
}

main().catch((error) => {
  process.stderr.write('[genos-ateam-stage-runner] ' + error.message + '\n');
  process.exitCode = 1;
}).finally(() => closeDatabase().catch(() => {}));
