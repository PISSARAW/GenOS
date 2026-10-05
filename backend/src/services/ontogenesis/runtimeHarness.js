'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { processRows, treeRows, ownsProcess } = require('./processResources');
const { managedRoot, ensureIntegration } = require('./worktreeService');
const { terminatePid } = require('../processTermination');

const RUNNER = path.resolve(__dirname, '../../../bin/ontogenesisMissionRunner.cjs');

function createRuntimeHarness(db) {
  return {
    prepare: ensureIntegration,
    start: (input) => launch(db, input),
    observe: (run) => observeRun(run),
    stop: (run) => stopRun(db, run),
    resources: (project) => resources(db, project)
  };
}

function requestFor(input) {
  const checks = input.config.checks || [];
  const roles = input.selection.workerRoles || [];
  const workerAssignments = Object.fromEntries(roles.map((role) => [role, {
    workerKind: role,
    workerRequirements: { requiredCapabilities: input.mission?.capabilities || [], allowedKinds: [role] }
  }]));
  return {
    id: input.id, mission: `${topologyInstruction(input.selection.topology)}\n${input.project.objective}\n\nTask: ${input.task.title}\nAcceptance: ${input.task.acceptance_json}\nMorphogenesis: ${JSON.stringify(input.mission?.morphology || {})}\nTopology: ${input.selection.topology}; variant: ${input.selection.variant}. Return executable evidence; do not commit or push.`,
    projectId: input.project.id, taskId: input.task.id, missionScope: input.worktree,
    autonomousOrchestration: true, useMemoryContext: true,
    proposedTopology: input.selection.topology, morphologyTopology: input.selection.topology,
    organization: input.mission?.morphology?.selectedOrganization || undefined,
    capabilities: input.mission?.capabilities || [],
    capabilityRequirements: input.mission?.capabilities || [],
    capabilityContract: { required: input.mission?.capabilities || [] },
    capabilityCatalog: input.mission?.capabilityCatalog || [],
    worker_assignments: workerAssignments,
    morphologyPlan: input.mission?.morphology || null,
    missionCapabilityPlan: input.mission?.plan || null,
    problemProfile: input.mission?.profile || {},
    requiresEvidenceBeforePromotion: true,
    workspaceRoot: input.worktree,
    trinityMode: input.selection.topology === 'trinity' ? 'explicit' : undefined,
    aTeamMode: input.selection.topology === 'a_team' ? 'explicit' : undefined,
    variant: input.selection.variant,
    timeoutMs: Math.floor(input.budgets.seconds * 600),
    executionBudget: { tokens: input.budgets.tokens, costUsd: input.budgets.usd, latencyMs: Math.floor(input.budgets.seconds * 600) },
    allowed_commands: checks.map((check) => [check.program, ...check.args].join(' ')),
    executor: input.config.executor, provider: input.config.provider, modelId: input.config.modelId
  };
}

function topologyInstruction(topology) {
  if (topology === 'trinity') return 'Use Trinity.';
  if (topology === 'a_team') return 'Use A-Team.';
  return `Proposed morphology: ${topology}.`;
}

async function launch(db, input) {
  const databases = await db.all('PRAGMA database_list');
  const database = databases.find((entry) => entry.name === 'main');
  if (!database || !database.file) throw new Error('runtime-base-persistante-requise');
  const directory = path.join(managedRoot(input.project), 'requests');
  fs.mkdirSync(directory, { recursive: true });
  const requestPath = path.join(directory, `${input.id}.json`);
  fs.writeFileSync(requestPath, JSON.stringify(requestFor(input)), { flag: 'wx' });
  const child = spawn(process.execPath, [RUNNER, '--operation', input.id, requestPath], {
    cwd: path.resolve(__dirname, '../../../..'), detached: process.platform !== 'win32',
    windowsHide: true, stdio: 'ignore', shell: false,
    env: { ...process.env, GENOS_DB_PATH: database.file, GENOS_WORKSPACE_ROOT: input.worktree,
      GENOS_CAPSULE_ROOT: path.join(managedRoot(input.project), 'capsules'), GENOS_WORKTREE_GC_DELAY_MS: '-1' }
  });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  return { pid: child.pid, executable: RUNNER };
}

async function observeRun(run) {
  const rows = await processRows();
  const row = rows.find((entry) => entry.pid === run.pid);
  return { alive: ownsProcess(row, run, RUNNER) };
}

async function stopRun(db, run) {
  const runtime = require('../agentRuntimeAdapter');
  await runtime.stopMission(run.id);
  const row = (await processRows()).find((entry) => entry.pid === run.pid);
  if (ownsProcess(row, run, RUNNER)) terminatePid(run.pid);
  return !(await observeRun(run)).alive;
}

async function resources(db, project) {
  const executions = await db.all("SELECT * FROM ontogenesis_execution WHERE phase IN ('prepared','running','finished','verified')");
  const rows = await processRows();
  const roots = executions.filter((run) => ownsProcess(rows.find((row) => row.pid === run.pid), run, RUNNER)).map((run) => run.pid);
  const ownedMb = treeRows(rows, [process.pid, ...roots]).reduce((sum, row) => sum + row.mb, 0);
  const reservationsMb = executions.filter((run) => !roots.includes(run.pid)).reduce((sum, run) => sum + run.reservation_mb, 0);
  return { ownedMb, reservationsMb };
}

module.exports = { createRuntimeHarness, requestFor, RUNNER };
