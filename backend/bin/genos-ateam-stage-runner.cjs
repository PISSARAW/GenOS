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
const topologySessionStore = require('../src/services/topologySessionStore');
const aTeamRuntimeDecision = require('../src/services/aTeamRuntimeDecisionService');
const { emit } = require('../src/services/agentOrchestrationState');

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
  const session = await topologySessionStore.load(db, plan.planId);
  if (!session) throw new Error(`Durable A-Team plan '${plan.planId}' was not found.`);
  const launch = async (member) => {
    const child = spawn(process.execPath, [bridgePath, JSON.stringify(scheduler.workerLaunchPayload({ plan, member, parentWorkspaceRoot, request }))], {
      cwd: repoRoot || process.cwd(),
      detached: true,
      stdio: runnerStdio(member.workerId)
    });
    child.unref();
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
  const workerWait = await scheduler.waitForWorkersTerminal(db, plan.members.map((member) => member.workerId), {
    pollMs: payload.pollMs, timeoutMs: payload.timeoutMs
  });
  const terminal = await aTeamRuntimeDecision.evaluateRuntimeDecision({ db, plan, stageResults: results, workerWait });
  await topologySessionStore.save(db, {
    id: plan.planId,
    topology: 'a_team',
    expectedVersion: session.storeVersion,
    state: { ...session.state, status: terminal.decision, stageResults: results, terminalDecision: terminal, completedAt: new Date().toISOString() }
  });
  emit(plan.orchestratorId, 'A_TEAM_TERMINAL_DECISION', 'ARBITRATE_INTEGRATION',
    `A-Team terminal decision: ${terminal.decision} (${terminal.reason}).`,
    { planId: plan.planId, terminal, results }, terminal.decision === 'completed' ? 'info' : 'warning');
}

main()
  .catch((error) => { process.stderr.write(`[genos-ateam-stage-runner] ${error.message}\n`); process.exitCode = 1; })
  .finally(() => { closeDatabase().catch(() => {}); });
