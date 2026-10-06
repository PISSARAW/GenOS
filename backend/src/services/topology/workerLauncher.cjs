'use strict';

const { randomUUID } = require('crypto');
const { workerLaunchPayload } = require('../../../bin/workerLaunchPayload.cjs');
const { buildLaunchCapabilities } = require('../agents/agentIncarnationPayloadService.js');
const { ensureTopologyWorker } = require('../topologyWorkerPersistenceService.js');
const detachedSpawn = require('../../../bin/detachedSpawn.cjs');

function createOrchestratorId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function launchCapabilities(context, member) {
  return buildLaunchCapabilities({
    role: member.role,
    prompt: member.mission || context.task,
    domain: context.request?.domain,
    mode: context.request?.mode,
    organization: context.request?.organization,
    budgetTokens: Number.isFinite(member.executionBudgetTokens)
      ? member.executionBudgetTokens
      : member.executionBudget?.tokens ?? context.request?.execution_budget?.tokens ?? context.request?.executionBudget?.tokens,
    capabilitiesHint: member.capabilities,
  });
}

function runnerEnvironment() {
  return {
    ...process.env,
    GENOS_LOCAL_MODEL: process.env.GENOS_LOCAL_MODEL || '',
    GENOS_AGENT_EXECUTOR: process.env.GENOS_AGENT_EXECUTOR || '',
    GENOS_DEFAULT_MODEL: process.env.GENOS_DEFAULT_MODEL || '',
    GENOS_RUNNER_LOG_DIR: detachedSpawn.runtimeDirectory(),
    GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_BOOTSTRAP_SKIP: '1',
    GENOS_EXECUTION_MODE: 'orchestrator'
  };
}

async function persistWorkerIdentity({ db, context, member, parent, workerId }) {
  return ensureTopologyWorker(db, {
    workerId,
    parentId: context.orchestratorId,
    workspaceId: parent.workspace_id,
    isolationMode: parent.isolation_mode,
    modelTier: member.modelTier || parent.model_tier,
    name: member.name || member.label || member.role,
    role: member.role || 'worker',
    workerKind: member.workerKind,
    methodContract: member.methodContract,
    workerAssignment: member.workerAssignment,
    topologySessionId: context.request.mode === 'syncytium' ? context.topologySession?.sessionId : null,
    mission: member.mission || context.task
  });
}

function getRunnerStdio(workerId) {
  return detachedSpawn.openRunnerStdio(workerId);
}

async function spawnTopologyWorker({ db, context, member, parent, workerId, launchCaps }) {
  const awaitWorker = context.request.mode === 'rhizome' || process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1';
  const payload = workerLaunchPayload({ context, member, workerId, parent,
    capabilities: launchCaps.capabilities, capabilityManifest: launchCaps.capabilityManifest,
    toolLease: launchCaps.toolLease });
  const args = [context.bridgePath, ...detachedSpawn.toSpawnArgs(JSON.stringify(payload))];
  const log = getRunnerStdio(workerId);
  const runner = require('child_process').spawn(process.execPath,
    args,
    { cwd: context.repoRoot, detached: !awaitWorker, shell: false,
      windowsHide: true, stdio: log.stdio, env: runnerEnvironment() });
  runner.once('spawn', log.close);
  runner.once('error', log.close);
  await waitForWorkerStart(runner, db, workerId);
  if (awaitWorker) await waitForWorkerExit(runner, db, workerId);
}

async function waitForWorkerStart(runner, db, workerId) {
  try {
    await new Promise((resolve, reject) => {
      runner.once('spawn', resolve);
      runner.once('error', reject);
    });
  } catch (error) {
    await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, workerId);
    throw error;
  }
}

async function waitForWorkerExit(runner, db, workerId) {
  const exitCode = await new Promise((resolve) => runner.once('close', resolve));
  if (exitCode === 0) return;
  await db.run("UPDATE agents SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'idle'", workerId);
  throw new Error('Topology worker ' + workerId + ' exited with code ' + exitCode + '; inspect its runner log.');
}

function workerSummary(member, index, workerId) {
  return {
    workerId,
    subSystem: member.subSystem,
    memberNumber: member.memberNumber || index,
    role: member.role,
    branchCandidateId: member.branchCandidateId,
    branchCandidateLabel: member.branchCandidateLabel,
    branchCandidateReason: member.branchCandidateReason,
    modelTier: member.modelTier,
    mission: member.mission,
    status: 'accepted',
  };
}

function selectMembers(members, available, waveSize) {
  if (!Array.isArray(members)) return [];
  const workers = members.filter((member) => member.executionMode !== 'orchestrator');
  const required = Math.min(workers.length, waveSize || workers.length);
  if (available < required) {
    throw Object.assign(new Error(`Biological dispatch requires ${required} free worker slots, but only ${available} available`), { code: 'WORKER_GARAGE_FULL' });
  }
  return workers;
}

async function launchWorker({ db, context, member, index, parent, suppliedWorkerId }) {
  const workerId = suppliedWorkerId || member.workerId || createOrchestratorId(`worker_${context.orchestratorId}_${index}`);
  const launchCaps = launchCapabilities(context, member);
  await persistWorkerIdentity({ db, context, member, parent, workerId });
  await spawnTopologyWorker({ db, context, member, parent, workerId, launchCaps });
  return workerSummary(member, index, workerId);
}

module.exports = {
  createOrchestratorId,
  launchCapabilities,
  runnerEnvironment,
  persistWorkerIdentity,
  getRunnerStdio,
  spawnTopologyWorker,
  waitForWorkerStart,
  waitForWorkerExit,
  workerSummary,
  launchWorker,
  selectMembers
};