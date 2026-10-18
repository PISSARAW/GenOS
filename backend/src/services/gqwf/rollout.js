'use strict';

const crypto = require('node:crypto');
const config = require('../../config/orchestratorConfig');

const STATUSES = new Set(['assigned', 'prepared', 'completed', 'failed']);
const TRANSITIONS = {
  assigned: new Set(['assigned', 'prepared', 'failed']),
  prepared: new Set(['prepared', 'completed', 'failed']),
  completed: new Set(['completed']),
  failed: new Set(['failed'])
};

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`GQWF canary requires ${label}.`);
  }
  return value.trim();
}

function scopeFor(mission, policy) {
  return {
    organizationId: requiredText(mission.organizationId
      || mission.organization_id || mission.tenantId, 'an organization ID'),
    projectId: mission.projectId || mission.project_id || null,
    workspaceId: requiredText(mission.workspaceId, 'a workspace ID'),
    policyId: requiredText(policy.policyId, 'a policy ID')
  };
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('GQWF canary policy must be an object.');
  }
  if (typeof policy.enabled !== 'boolean') {
    throw new Error('GQWF canary policy requires an explicit enabled boolean.');
  }
  if (!Number.isInteger(policy.basisPoints)
    || policy.basisPoints < 1 || policy.basisPoints > 10000) {
    throw new Error('GQWF canary basisPoints must be an integer from 1 to 10000.');
  }
}

function assignment(scope, policy, disabled) {
  const basis = JSON.stringify([
    scope.organizationId, scope.projectId, scope.workspaceId, scope.policyId
  ]);
  const basisHash = crypto.createHash('sha256').update(basis).digest('hex');
  const bucket = Number.parseInt(basisHash.slice(0, 8), 16) % 10000;
  const disabledReason = !policy.enabled
    ? 'policy_disabled' : disabled ? 'operator_kill_switch' : null;
  return {
    version: 1,
    ...scope,
    basisPoints: policy.basisPoints,
    basisHash,
    bucket,
    arm: !disabledReason && bucket < policy.basisPoints ? 'canary' : 'control',
    disabledReason
  };
}

function routeMission(mission, options = {}) {
  if (mission.gqwfRollout) return mission;
  const policy = mission.executionPolicy?.gqwfCanary;
  if (!policy) return mission;
  if (mission.executionPolicy?.gqwfV2 === true) {
    throw new Error('GQWF explicit mode and canary policy cannot be requested together.');
  }
  validatePolicy(policy);
  const disabled = options.disabled === undefined ? config.gqwfCanaryDisabled() : options.disabled;
  const decision = assignment(scopeFor(mission, policy), policy, disabled === true);
  return {
    ...mission,
    gqwfRollout: decision,
    executionPolicy: { ...mission.executionPolicy, gqwfV2: decision.arm === 'canary' }
  };
}

function describe(row) {
  return {
    executionRunId: row.execution_run_id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    policyId: row.policy_id,
    basisHash: row.basis_hash,
    basisPoints: row.basis_points,
    bucket: row.bucket,
    arm: row.arm,
    disabledReason: row.disabled_reason,
    status: row.status,
    outcome: row.outcome,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function assertRegisteredScope(ctx, decision) {
  const row = await ctx.db.get(
    'SELECT organization_id, project_id FROM workspaces WHERE id = ?', decision.workspaceId);
  if (!row || row.organization_id !== decision.organizationId
    || (decision.projectId && row.project_id !== decision.projectId)) {
    throw new Error('GQWF canary scope differs from the registered workspace.');
  }
}

function sameDecision(row, decision) {
  const durable = [row.workspace_id, row.organization_id, row.project_id || null,
    row.policy_id, row.basis_hash, row.basis_points, row.bucket, row.arm,
    row.disabled_reason || null];
  const assigned = [decision.workspaceId, decision.organizationId,
    decision.projectId || null, decision.policyId, decision.basisHash,
    decision.basisPoints, decision.bucket, decision.arm,
    decision.disabledReason || null];
  return JSON.stringify(durable) === JSON.stringify(assigned);
}

async function persistDecision(ctx) {
  const decision = ctx.normalizedMission.gqwfRollout;
  if (!decision) return null;
  const executionRunId = ctx.executionRun?.id;
  if (!executionRunId) throw new Error('GQWF canary decision requires an execution run.');
  await assertRegisteredScope(ctx, decision);
  await ctx.db.run(`INSERT OR IGNORE INTO gqwf_rollout_decisions
    (execution_run_id, workspace_id, organization_id, project_id, policy_id,
      basis_hash, basis_points, bucket, arm, disabled_reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned')`, executionRunId,
  decision.workspaceId, decision.organizationId, decision.projectId, decision.policyId,
  decision.basisHash, decision.basisPoints, decision.bucket, decision.arm,
  decision.disabledReason);
  const row = await ctx.db.get(
    'SELECT * FROM gqwf_rollout_decisions WHERE execution_run_id = ?', executionRunId);
  if (!sameDecision(row, decision)) {
    throw new Error('GQWF canary decision conflicts with its durable assignment.');
  }
  return describe(row);
}

async function markStatus(db, input) {
  if (!STATUSES.has(input.status)) throw new Error('Invalid GQWF canary status.');
  const row = await db.get(
    'SELECT * FROM gqwf_rollout_decisions WHERE execution_run_id = ?', input.executionRunId);
  if (!row) return null;
  if (!TRANSITIONS[row.status]?.has(input.status)) {
    throw new Error(`Invalid GQWF canary transition from '${row.status}' to '${input.status}'.`);
  }
  await db.run(`UPDATE gqwf_rollout_decisions
    SET status = ?, outcome = ?, error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE execution_run_id = ?`, input.status, input.outcome || null,
  input.error ? String(input.error).slice(0, 1000) : null, input.executionRunId);
  return describe(await db.get(
    'SELECT * FROM gqwf_rollout_decisions WHERE execution_run_id = ?', input.executionRunId));
}

function summarize(rows) {
  const summary = {
    total: rows.length,
    arms: { control: 0, canary: 0 },
    statuses: { assigned: 0, prepared: 0, completed: 0, failed: 0 },
    canaryFailureRate: null
  };
  for (const row of rows) {
    summary.arms[row.arm] += 1;
    summary.statuses[row.status] += 1;
  }
  const terminal = rows.filter((row) => row.arm === 'canary'
    && ['completed', 'failed'].includes(row.status));
  if (terminal.length) {
    summary.canaryFailureRate = terminal.filter((row) => row.status === 'failed').length
      / terminal.length;
  }
  return summary;
}

async function inspectRollout(db, input) {
  const workspaceId = requiredText(input.workspaceId, 'a workspace ID');
  const policyId = input.policyId ? requiredText(input.policyId, 'a policy ID') : null;
  const rows = policyId
    ? await db.all(`SELECT * FROM gqwf_rollout_decisions
      WHERE workspace_id = ? AND policy_id = ? ORDER BY created_at, execution_run_id`,
    workspaceId, policyId)
    : await db.all(`SELECT * FROM gqwf_rollout_decisions
      WHERE workspace_id = ? ORDER BY created_at, execution_run_id`, workspaceId);
  return { workspaceId, policyId, summary: summarize(rows), decisions: rows.map(describe) };
}

module.exports = { inspectRollout, markStatus, persistDecision, routeMission };
