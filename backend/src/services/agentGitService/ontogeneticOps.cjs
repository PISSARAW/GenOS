'use strict';

const { getDatabase } = require('../../db');

async function compareTrajectories(req) {
  const db = await getDatabase();
  const { baselineObjectId, candidateObjectId } = req.body || {};
  if (!baselineObjectId || !candidateObjectId) return { success: false, error: 'baselineObjectId and candidateObjectId are required.' };
  const [baseline, candidate] = await Promise.all([
    loadCommit(db, req, baselineObjectId),
    loadCommit(db, req, candidateObjectId)
  ]);
  if (!baseline || !candidate) return { success: false, error: 'Both commits must exist in the current tenant.' };
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

async function loadCommit(db, req, objectId) {
  const scope = require('./index').scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

function readState(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return {}; }
}

function compareIdentity(before = {}, after = {}) {
  const fields = ['name', 'role', 'model_tier', 'language'];
  const changed = fields.filter((field) => before[field] !== after[field]);
  return { stable: changed.length === 0, changedFields: changed };
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

module.exports = { compareTrajectories, compareIdentity, compareCapabilities, summarizeRuns };
