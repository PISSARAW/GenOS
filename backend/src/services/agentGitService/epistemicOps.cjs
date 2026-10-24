'use strict';

const { getDatabase } = require('./agentGitDb.cjs');
const { identityOf } = require('./sectionIdentity.cjs');

async function epistemicMerge(req) {
  const db = await getDatabase();
  const { baseObjectId, leftObjectId, rightObjectId } = req.body || {};
  if (!baseObjectId || !leftObjectId || !rightObjectId) {
    return { success: false, error: 'baseObjectId, leftObjectId, and rightObjectId are required.' };
  }
  const ids = [baseObjectId, leftObjectId, rightObjectId];
  const objects = await Promise.all(ids.map((id) => getObject(db, req, id)));
  if (objects.some((object) => !object)) return { success: false, error: 'All three commits must exist in the current tenant.' };
  const verification = verifySnapshots(objects);
  if (!verification.verified) return { success: false, operation: 'epistemic-merge-preview', error: 'Snapshot verification failed.', verification };
  const [base, left, right] = objects.map((object) => parseState(object.state_json).decisions || []);
  return {
    success: true,
    operation: 'epistemic-merge-preview',
    baseObjectId,
    leftObjectId,
    rightObjectId,
    ...mergeDecisions({ base, left, right, leftObjectId, rightObjectId })
  };
}

function verifySnapshots(snapshots) {
  const { verifySource } = require('./verifiedMerge.cjs');
  const issues = snapshots.flatMap(verifySource);
  return { verified: issues.length === 0, issues };
}

async function getObject(db, req, objectId) {
  const scopeSql = require('./index').scopeSql;
  const scope = scopeSql(req, 'w');
  return db.get(
    `SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`,
    objectId,
    ...scope.params
  );
}

function parseState(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return {}; }
}

function mergeDecisions(ctx) {
  const base = asMap(ctx.base);
  const left = asMap(ctx.left);
  const right = asMap(ctx.right);
  const ids = new Set([...base.keys(), ...left.keys(), ...right.keys()]);
  const merged = [];
  const contradictions = [];
  for (const id of ids) mergeOne({ ...ctx, id, base: base.get(id), left: left.get(id), right: right.get(id), merged, contradictions });
  return { decisions: merged, contradictions };
}

function asMap(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [identityOf('decisions', item), item]));
}

function mergeOne(ctx) {
  const { id, base, left, right, merged, contradictions } = ctx;
  const leftChanged = !same(base, left);
  const rightChanged = !same(base, right);
  if (!leftChanged && !rightChanged) return addIfPresent(merged, left || right);
  if (!leftChanged) return addIfPresent(merged, right);
  if (!rightChanged || same(left, right)) return addIfPresent(merged, left);
  contradictions.push({
    id,
    type: 'divergent_decision',
    leftObjectId: ctx.leftObjectId,
    rightObjectId: ctx.rightObjectId,
    left: left || null,
    right: right || null,
    base: base || null,
    resolution: 'unresolved'
  });
}

function addIfPresent(items, item) {
  if (item) items.push(item);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

module.exports = { epistemicMerge, mergeDecisions };
