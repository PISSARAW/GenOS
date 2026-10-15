'use strict';

const { activeProcesses } = require('./agentOrchestrationState');
const cooperative = require('./cooperativeRuntimeControl');
const threads = require('./cellThreadService');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

function failure(code, detail) {
  return { proven: false, code, detail };
}

async function resume(request) {
  const lineage = cooperative.lineage(request);
  const child = activeProcesses.get(lineage.workerId);
  if (!child) return failure('RUNTIME_UNAVAILABLE',
    'No exact live runtime can prove checkpoint resume.');
  if (!cooperative.exactLineage(child.genosControlIdentity, lineage)) {
    return failure('RUNTIME_IDENTITY_UNPROVEN',
      'Live process identity does not match the checkpoint CellThread.');
  }
  const result = await cooperative.request({
    child, action: 'resume_checkpoint', lineage,
    checkpoint: {
      checkpointId: request.checkpointId,
      checkpointHash: request.checkpointHash,
      contextHash: request.contextHash, context: request.context,
      contextSize: request.contextSize, evidenceRefs: request.evidenceRefs
    }
  });
  if (!result.proven) return result;
  return {
    proven: true, proofCode: result.code,
    checkpointId: request.checkpointId, checkpointHash: request.checkpointHash,
    contextHash: request.contextHash,
    missionId: request.missionId, episodeId: request.episodeId,
    threadId: request.threadId, workerId: request.workerId,
    organizationId: request.organizationId, projectId: request.projectId
  };
}

function exactThread(row, lineage) {
  return row.mission_id === lineage.missionId
    && row.episode_id === lineage.episodeId && row.worker_id === lineage.workerId;
}

async function persistedCapture(db, input) {
  const row = await db.get(`SELECT state.id, state.status, state.reason,
      state.state_json, state.workspace_id, workspace.organization_id,
      workspace.project_id
    FROM agent_runtime_state state
    JOIN agents agent ON agent.id = state.agent_id
    JOIN workspaces workspace ON workspace.id = agent.workspace_id
    WHERE state.id = ? AND state.agent_id = ?`,
  input.capture.runtimeStateId, input.lineage.workerId);
  if (!row || row.status !== 'generated' || row.reason !== 'local-runtime-checkpoint'
    || row.organization_id !== input.lineage.organizationId
    || row.project_id !== input.lineage.projectId) return false;
  let state;
  try { state = JSON.parse(row.state_json || '{}'); }
  catch (_) { return false; }
  return state.workspaceId === row.workspace_id && state.status === 'generated'
    && canonicalJson(state.checkpoint) === canonicalJson(input.capture.context);
}

async function capture(db, request) {
  const lineage = cooperative.lineage(request);
  const thread = await threads.requireScoped(db, lineage);
  if (!exactThread(thread, lineage) || thread.status !== 'waiting_signal') {
    return failure('RUNTIME_CHECKPOINT_THREAD_NOT_QUIESCENT',
      'CellThread must be paused before native checkpoint capture.');
  }
  const child = activeProcesses.get(lineage.workerId);
  if (!child) return failure('RUNTIME_UNAVAILABLE',
    'No live runtime can provide a native checkpoint.');
  if (!cooperative.exactLineage(child.genosControlIdentity, lineage)) {
    return failure('RUNTIME_IDENTITY_UNPROVEN',
      'Live process identity does not match the checkpoint CellThread.');
  }
  const result = await cooperative.request({ child, action: 'capture_checkpoint', lineage });
  if (!result.proven || !result.capture) return failure(
    result.code || 'RUNTIME_CHECKPOINT_CAPTURE_UNPROVEN',
    'Runtime did not prove a persisted generated checkpoint.');
  if (!await persistedCapture(db, { capture: result.capture, lineage })) return failure(
    'RUNTIME_CHECKPOINT_PERSISTENCE_DIVERGENT',
    'Captured checkpoint does not match persisted runtime state.');
  return { proven: true, proofCode: result.code, context: result.capture.context,
    evidenceRefs: [`agent-runtime-state:${result.capture.runtimeStateId}`,
      `runtime-context:${result.capture.contextHash}`] };
}

module.exports = { resume, capture };
