const { getDatabase } = require('../../db');
const fundamentals = require('./fundamentals');

async function uncertaintyGate(context = {}) {
  const uncertainty = Number(context.uncertainty);
  const threshold = Number(context.threshold ?? 0.5);
  if (!Number.isFinite(uncertainty) || !Number.isFinite(threshold) || uncertainty < 0 || uncertainty > 1 || threshold < 0 || threshold > 1) return { success: false, error: 'uncertainty and threshold must be within [0, 1].', code: 'UNCERTAINTY_INVALID' };
  return { success: true, allowed: uncertainty <= threshold, uncertainty, threshold, gateAction: uncertainty <= threshold ? 'PASS' : 'REQUIRE_APPROVAL' };
}

async function activeRefusal(context = {}) {
  const gate = await uncertaintyGate(context);
  if (!gate.success) return gate;
  if (gate.allowed) return { success: true, refused: false, reason: 'uncertainty is within the permitted threshold.', ...gate };
  return { success: true, refused: true, reason: String(context.reason || 'Insufficient certainty for autonomous execution.'), ...gate };
}

async function approvalRequest(context = {}) {
  const db = await getDatabase();
  const organizationId = context.organizationId || context.organization_id;
  const projectId = context.projectId || context.project_id;
  const action = String(context.action || '').trim();
  if (!organizationId || !projectId || !action) return { success: false, error: 'organizationId, projectId and action are required.', code: 'APPROVAL_INPUT_REQUIRED' };
  const id = `strategy-approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.run('INSERT INTO platform_approvals (id, action, agent_id, risk, uncertainty, requested_by, organization_id, project_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, action, context.agentId || null, context.risk || 'high', Number(context.uncertainty || 0), context.requestedBy || context.agentId || 'strategy', organizationId, projectId, JSON.stringify(context.payload || context));
  return { success: true, approvalId: id, status: 'pending', action, organizationId, projectId };
}

async function driftThreshold(context = {}) {
  const result = await fundamentals.entropyCheck(context);
  if (!result.success) return result;
  const threshold = Number(context.threshold ?? 0.8);
  return { success: true, ...result, threshold, driftDetected: result.normalizedEntropy >= threshold || result.cognitiveDriftState === 'high_drift' };
}

async function deadLetterQueue(context = {}) {
  const db = await getDatabase();
  const limit = Math.min(100, Math.max(1, Number(context.limit || 50)));
  const tables = ['workflow_runs', 'evaluation_jobs', 'model_jobs'];
  const entries = [];
  for (const table of tables) {
    const rows = await db.all(`SELECT id, status, attempts, error_json, completed_at FROM ${table} WHERE status = 'failed' AND error_json LIKE '%"deadLetter":true%' ORDER BY completed_at DESC LIMIT ?`, limit);
    entries.push(...rows.map((row) => ({ table, ...row })));
  }
  return { success: true, entries: entries.sort((left, right) => String(right.completed_at || '').localeCompare(String(left.completed_at || ''))).slice(0, limit), count: entries.length };
}

module.exports = { uncertaintyGate, activeRefusal, approvalRequest, driftThreshold, deadLetterQueue };
