'use strict';

const { getDatabase } = require('./agentGitDb.cjs');

async function compareTrajectories(req) {
  const db = await getDatabase();
  const { baselineObjectId, candidateObjectId } = req.body || {};
  if (!baselineObjectId || !candidateObjectId) return { success: false, error: 'baselineObjectId and candidateObjectId are required.' };
  const [baseline, candidate] = await Promise.all([
    loadCommit(db, req, baselineObjectId),
    loadCommit(db, req, candidateObjectId)
  ]);
  if (!baseline || !candidate) return { success: false, error: 'Both commits must exist in the current tenant.' };
  const verification = verifySnapshots([baseline, candidate]);
  if (!verification.verified) return { success: false, operation: 'ontogenetic-compare', error: 'Snapshot verification failed.', verification };
  return {
    success: true,
    operation: 'ontogenetic-compare',
    baselineObjectId,
    candidateObjectId,
    identity: compareIdentity(readState(baseline.state_json).agent, readState(candidate.state_json).agent),
    capabilities: compareCapabilities(readState(baseline.state_json).plasmids, readState(candidate.state_json).plasmids),
    execution: { baseline: summarizeRuns(readState(baseline.state_json).runs), candidate: summarizeRuns(readState(candidate.state_json).runs) },
    selection: 'not_performed'
  };
}

async function createOntogeneticFork(req) {
  const scope = forkScope(req);
  if (!scope.allowed) return { success: false, operation: 'ontogenetic-fork', error: scope.error };
  const linked = req.body?.objectId ? await linkedSnapshot(req) : null;
  if (linked && !linked.valid) return { success: false, operation: 'ontogenetic-fork', error: linked.error };
  const handler = require('../mcpBioTools/handlers/agentForkSnapshot');
  const result = await handler.handleAgentForkSnapshot({
    agent_id: req.body?.agentId,
    snapshot_id: linked?.snapshotId || req.body?.snapshotId,
    idempotency_key: req.body?.idempotencyKey,
    budget: req.body?.budget
  });
  return { ...result, operation: 'ontogenetic-fork' };
}

async function linkedSnapshot(req) {
  const db = await getDatabase();
  const object = await loadCommit(db, req, req.body.objectId);
  if (!object || object.agent_id !== req.body.agentId) {
    return { valid: false, error: 'Linked AgentGit checkpoint is outside the agent scope.' };
  }
  return require('./checkpointBridge.cjs').verifyLink(db, object);
}

function forkScope(req) {
  const env = process.env;
  const configured = env.GENOS_MCP_ALLOW_AGENT_FORK === 'true' && env.GENOS_MCP_AGENT_ID
    && env.GENOS_MCP_FORK_ROOT && env.GENOS_MCP_ORGANIZATION_ID && env.GENOS_MCP_PROJECT_ID;
  if (!configured) return { allowed: false, error: 'A server-bound fork agent, tenant, and root are required.' };
  const sameAgent = req.body?.agentId === env.GENOS_MCP_AGENT_ID;
  const sameTenant = req.tenant?.organizationId === env.GENOS_MCP_ORGANIZATION_ID
    && req.tenant?.projectId === env.GENOS_MCP_PROJECT_ID;
  return sameAgent && sameTenant
    ? { allowed: true }
    : { allowed: false, error: 'Fork request is outside the server-bound agent or tenant.' };
}

function verifySnapshots(snapshots) {
  const { verifySource } = require('./verifiedMerge.cjs');
  const issues = snapshots.flatMap(verifySource);
  return { verified: issues.length === 0, issues };
}

async function loadCommit(db, req, objectId) {
  const scope = require('./scopeSql.cjs').scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

function readState(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return {}; }
}

function compareIdentity(before = {}, after = {}) {
  const fields = ['role', 'model_tier', 'language'];
  const changed = fields.filter((field) => before[field] !== after[field]);
  return { stable: changed.length === 0, changedFields: changed,
    displayNameChanged: before.name !== after.name };
}

function compareCapabilities(before = [], after = []) {
  const oldIds = new Set((Array.isArray(before) ? before : []).map((item) => item.plasmid_id));
  const newIds = new Set((Array.isArray(after) ? after : []).map((item) => item.plasmid_id));
  const preserved = [...oldIds].filter((id) => id && newIds.has(id));
  return {
    preservedPlasmids: preserved,
    lostPlasmids: [...oldIds].filter((id) => id && !newIds.has(id)),
    acquiredPlasmids: [...newIds].filter((id) => id && !oldIds.has(id))
  };
}

function summarizeRuns(runs = []) {
  const validRuns = Array.isArray(runs) ? runs : [];
  return {
    count: validRuns.length,
    statuses: validRuns.reduce((counts, run) => {
      counts[run.status || 'unknown'] = (counts[run.status || 'unknown'] || 0) + 1;
      return counts;
    }, {}),
    budgetConsumed: validRuns.reduce((total, run) => total + parseBudget(run.budget_json), 0)
  };
}

function parseBudget(serialized) {
  try { return Number(JSON.parse(serialized || '{}').consumed) || 0; } catch (_) { return 0; }
}

module.exports = { compareTrajectories, createOntogeneticFork, forkScope, compareIdentity, compareCapabilities, summarizeRuns };
