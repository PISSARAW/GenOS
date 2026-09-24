#!/usr/bin/env node
'use strict';

/**
 * Detached A-Team stage runner. Receives a stage plan, waits for each stage's
 * dependencies to reach a terminal state, then launches the stage's workers
 * through the same orchestrate bridge. It is spawned by dispatch_team when the
 * team has more than one pipeline stage, so the MCP call stays fast while the
 * dependency gating happens out of band.
 */
const path = require('path');
const { spawn } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const scheduler = require('../src/services/aTeamStageScheduler');
const { emit, updateAgent } = require('../src/services/agentOrchestrationState');
const handoffEvidence = require('../src/services/aTeamHandoffEvidenceService');

function parseArgs(argv) {
  try {
    return JSON.parse(argv[2] || '{}');
  } catch (error) {
    throw new Error(`Invalid stage-runner payload: ${error.message}`);
  }
}

function runnerStdio(workerId) {
  const logDir = process.env.GENOS_RUNNER_LOG_DIR;
  if (!logDir) return 'ignore';
  try {
    const fs = require('fs');
    fs.mkdirSync(logDir, { recursive: true });
    const fd = fs.openSync(path.join(logDir, `${workerId}.log`), 'a');
    return ['ignore', fd, fd];
  } catch {
    return 'ignore';
  }
}

async function main() {
  const payload = parseArgs(process.argv);
  const { plan, bridgePath, repoRoot, request = {}, parentWorkspaceRoot } = payload;
  if (!plan || !plan.members || !bridgePath) throw new Error('Stage runner requires plan, members and bridgePath.');
  const db = await getDatabase();
  const launch = async (member) => {
    const handoff = await handoffEvidence.buildHandoffsFromTelemetry({ db, plan, consumer: member });
    if (!handoff.ok) {
      await updateAgent(member.workerId, 'blocked', `A-Team dependency evidence unavailable: ${handoff.missingDependency}`);
      return false;
    }
    const enrichedMember = {
      ...member,
      handoffContext: handoff.handoffs,
      mission: handoffEvidence.missionWithHandoffs(member.mission, handoff.handoffs)
    };
    const child = spawn(process.execPath, [bridgePath, JSON.stringify(scheduler.workerLaunchPayload({ plan, member: enrichedMember, parentWorkspaceRoot, request }))], {
      cwd: repoRoot || process.cwd(),
      detached: true,
      stdio: runnerStdio(member.workerId)
    });
    child.unref();
    return true;
  };
  const results = await scheduler.runStagePlan({
    db,
    plan,
    launch,
    options: {
      skipWorkerIds: Array.isArray(payload.skipWorkerIds) ? payload.skipWorkerIds : [],
      pollMs: payload.pollMs,
      timeoutMs: payload.timeoutMs
    }
  });
  const timedOut = results.some((entry) => entry.timedOut);
  emit(plan.orchestratorId, 'A_TEAM_STAGES_COMPLETED', 'SCHEDULE_STAGES',
    timedOut ? 'A-Team stage scheduling finished with a dependency timeout.' : 'A-Team stage scheduling finished.',
    { planId: plan.planId, results }, timedOut ? 'warning' : 'info');
}

main()
  .catch((error) => { process.stderr.write(`[genos-ateam-stage-runner] ${error.message}\n`); process.exitCode = 1; })
  .finally(() => { closeDatabase().catch(() => {}); });
