'use strict';

const path = require('node:path');
const config = require('../../config/orchestratorConfig');
const { isLocalRuntime } = require('../agentRuntimeExecutable');
const { createFabric } = require('./index');

function samePath(left, right) {
  const first = path.resolve(left);
  const second = path.resolve(right);
  return process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase()
    : first === second;
}

function isInProcess(ctx) {
  const mission = ctx.normalizedMission;
  if (mission.executor === 'caller_mcp') return false;
  if (['control', 'observe'].includes(mission.continuousExecution?.mode)) return false;
  if (ctx.dispatchedAgent.execution_mode === 'worker'
    && (config.inProcessWorkers() || mission.inProcessWorker === true)) return true;
  return Boolean(mission.localModel
    && (mission.localRuntime === true || isLocalRuntime(ctx.executable)));
}

function eligible(ctx) {
  if (ctx.normalizedMission.executionPolicy?.gqwfV2 !== true) return false;
  if (ctx.normalizedMission.workspaceBackend === 'gqwf-worker'
    || ctx.normalizedMission.gqwfWorkerLease) return false;
  const deterministic = require('../agents/workerRuntimeLimitsService')
    .isDeterministicWorkerMission(ctx.normalizedMission);
  return !deterministic && !isInProcess(ctx);
}

function deferOrchestratorCopy(mission, executionMode) {
  if (executionMode !== 'orchestrator') return false;
  if (mission.executionPolicy?.gqwfV2 !== true) return false;
  return !(mission.localModel && mission.localRuntime === true);
}

function describe(row) {
  return {
    backend: 'gqwf',
    executionRunId: row.execution_run_id,
    workspaceId: row.workspace_id,
    baseHash: row.base_hash,
    viewId: row.view_id,
    leaseId: row.lease_id,
    candidateHash: row.candidate_hash,
    sourcePath: row.source_path,
    path: row.status === 'released' ? null : row.materialized_path,
    state: row.status,
    outcome: row.outcome,
    materialized: row.status !== 'virtual' && row.status !== 'released',
    error: row.error
  };
}

async function session(db, executionRunId) {
  return db.get('SELECT * FROM gqwf_execution_sessions WHERE execution_run_id = ?', executionRunId);
}

async function assertWorkspaceScope(ctx, workspaceId, sourcePath) {
  const workspace = await ctx.db.get('SELECT path FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace?.path || !samePath(workspace.path, sourcePath)) {
    throw Object.assign(new Error('GQWF mission workspace differs from its registered source.'), {
      code: 'GQWF_MISSION_WORKSPACE_MISMATCH'
    });
  }
}

async function createVirtualSession(ctx, input) {
  const fabric = createFabric(ctx.db);
  const base = await fabric.importBase({ workspaceId: input.workspaceId });
  const opened = await fabric.openExecutionWorkspace({
    workspaceId: input.workspaceId,
    baseHash: base.rootHash
  });
  await ctx.db.run(`INSERT INTO gqwf_execution_sessions
    (execution_run_id, agent_id, workspace_id, view_id, base_hash, source_path, status)
    VALUES (?, ?, ?, ?, ?, ?, 'virtual')`, input.executionRunId, ctx.agentId,
  input.workspaceId, opened.viewId, opened.baseHash, input.sourcePath);
  return { fabric, opened };
}

async function materializeSession(ctx, input, virtual) {
  try {
    const materialized = await virtual.fabric.materializeExecutionWorkspace({
      workspaceId: input.workspaceId,
      baseHash: virtual.opened.baseHash,
      viewId: virtual.opened.viewId,
      expectedVersion: virtual.opened.version
    });
    await ctx.db.run(`UPDATE gqwf_execution_sessions
      SET lease_id = ?, materialized_path = ?, status = 'materialized', error = NULL,
          updated_at = CURRENT_TIMESTAMP WHERE execution_run_id = ?`,
    materialized.leaseId, materialized.path, input.executionRunId);
    return materialized;
  } catch (error) {
    await ctx.db.run(`UPDATE gqwf_execution_sessions SET error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE execution_run_id = ?`, String(error.message).slice(0, 1000), input.executionRunId);
    throw error;
  }
}

function attachMissionWorkspace(ctx, descriptor) {
  ctx.executionWorkspace = descriptor;
  ctx.normalizedMission.gqwfSourceWorkspaceRoot = descriptor.sourcePath;
  ctx.normalizedMission.workspaceRoot = descriptor.path;
  ctx.normalizedMission.executionWorkspace = descriptor;
}

async function prepareMissionWorkspace(ctx) {
  if (!eligible(ctx)) return null;
  const workspaceId = ctx.normalizedMission.workspaceId || ctx.dispatchedAgent.workspace_id;
  if (!workspaceId) throw new Error('GQWF mission execution requires a workspace ID.');
  const sourcePath = path.resolve(ctx.normalizedMission.workspaceRoot);
  const executionRunId = ctx.executionRun?.id;
  if (!executionRunId) throw new Error('GQWF mission execution requires an execution run.');
  await assertWorkspaceScope(ctx, workspaceId, sourcePath);
  const input = { workspaceId, sourcePath, executionRunId };
  const virtual = await createVirtualSession(ctx, input);
  await materializeSession(ctx, input, virtual);
  const descriptor = describe(await session(ctx.db, executionRunId));
  attachMissionWorkspace(ctx, descriptor);
  return descriptor;
}

async function ingestSuccessfulRun(db, row) {
  if (row.status !== 'materialized') return row;
  const ingested = await createFabric(db).ingestExecutionWorkspace({
    workspaceId: row.workspace_id,
    leaseId: row.lease_id
  });
  await db.run(`UPDATE gqwf_execution_sessions
    SET candidate_hash = ?, status = 'ingested', outcome = 'completed', error = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE execution_run_id = ?`,
  ingested.candidateHash, row.execution_run_id);
  return session(db, row.execution_run_id);
}

async function releaseCompletedRun(db, row, outcomeStatus) {
  if (!['materialized', 'ingested'].includes(row.status)) {
    throw new Error(`GQWF execution session cannot release from '${row.status}'.`);
  }
  await createFabric(db).releaseExecutionWorkspace({
    workspaceId: row.workspace_id,
    leaseId: row.lease_id
  });
  const outcome = outcomeStatus === 'completed' ? 'completed' : 'discarded';
  await db.run(`UPDATE gqwf_execution_sessions
    SET status = 'released', outcome = ?, error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE execution_run_id = ?`, outcome, row.execution_run_id);
  return session(db, row.execution_run_id);
}

async function finalizeMissionWorkspace(input) {
  let row = await session(input.db, input.executionRunId);
  if (!row || row.status === 'released') return row ? describe(row) : null;
  try {
    if (input.outcomeStatus === 'completed') row = await ingestSuccessfulRun(input.db, row);
    row = await releaseCompletedRun(input.db, row, input.outcomeStatus);
    return describe(row);
  } catch (error) {
    await input.db.run(`UPDATE gqwf_execution_sessions SET error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE execution_run_id = ?`, String(error.message).slice(0, 1000), input.executionRunId);
    throw error;
  }
}

module.exports = {
  deferOrchestratorCopy,
  eligible,
  finalizeMissionWorkspace,
  prepareMissionWorkspace,
  session
};
