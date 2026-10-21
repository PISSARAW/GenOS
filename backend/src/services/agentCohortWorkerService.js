'use strict';

const { autonomousWorkerId } = require('./agentRoundService');
const { buildExecutionBudget } = require('./workerBudgetAllocationService');

function assignedWorkerId(assignment, context) {
  if (Number.isSafeInteger(context.delegationOrdinal) && context.delegationOrdinal > 0) return `${context.orchestratorId}-d${context.delegationOrdinal}`;
  if (context.morphogenesisCohort && assignment.workerId) return assignment.workerId;
  if (context.nativeMissionPlan && assignment.workerId) return assignment.workerId;
  if (context.teamRunId && assignment.workerId) return assignment.workerId;
  return autonomousWorkerId(context.orchestratorId, context.index + 1);
}

async function existingCohortWorker(db, workerId) {
  return db.get(`SELECT a.id AS agentId, a.name, a.role, a.status, a.runtime_pid, a.parent_agent_id,
    a.execution_mode, a.workspace_id, a.model_tier, a.isolation_mode, a.current_task,
    a.metadata_json, w.path AS workspaceRoot,
    EXISTS (SELECT 1 FROM garage_queue q WHERE q.worker_id = a.id
      AND (q.status IN ('queued', 'claimed', 'running') OR q.phase IN ('frozen', 'thawing', 'freezing', 'freeze_failed', 'cancelling'))) AS leased
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ?`, workerId);
}

function reuseCohortWorker(existing, context) {
  const { parentId, assignment, tokenBudget, mission } = context;
  assertCohortIdentity(existing, parentId, assignment);
  return { agentId: existing.agentId, name: existing.name, role: existing.role,
    workerKind: assignment.workerKind, workerContract: assignment.workerContract,
    workerAssignment: assignment, methodContract: assignment.methodContract || null,
    prompt: existing.current_task || '', toolLease: Array.isArray(assignment.tools) ? assignment.tools : [],
    capabilities: Array.isArray(assignment.capabilities) ? assignment.capabilities : [],
    workspaceId: existing.workspace_id || null, workspaceRoot: existing.workspaceRoot || null,
    executionBudget: buildExecutionBudget({ executionBudget: mission.executionBudget,
      assignedTokens: tokenBudget, index: 0, assignmentCount: 1 }) };
}

function assertCohortIdentity(existing, parentId, assignment) {
  if (existing.parent_agent_id !== parentId || existing.execution_mode !== 'worker'
    || existing.role !== assignment.role || existing.status !== 'idle' || existing.runtime_pid
    || Number(existing.leased) !== 0) {
    throw cohortIdentityError(existing, 'is not safely reusable.');
  }
  const metadata = parseWorkerMetadata(existing.metadata_json);
  if (metadata.workerKind !== assignment.workerKind
    || metadata.workerContract?.identity?.workerKind !== assignment.workerKind) {
    throw cohortIdentityError(existing, 'has a conflicting worker contract.');
  }
}

function cohortIdentityError(existing, reason) {
  return Object.assign(new Error(`Morphogenesis cohort identity '${existing.agentId}' ${reason}`), {
    code: 'MORPHOGENESIS_COHORT_IDENTITY_CONFLICT'
  });
}

function parseWorkerMetadata(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) {
    throw Object.assign(new Error('Sub-orchestrator metadata is invalid.'), {
      code: 'INVALID_SUBORCHESTRATOR_CONTRACT'
    });
  }
}

module.exports = { assignedWorkerId, existingCohortWorker, reuseCohortWorker };
