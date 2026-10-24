'use strict';

const { getDatabase } = require('../../db');
const { identityOf } = require('./sectionIdentity.cjs');

const SOCIAL_FIELDS = {
  children: ['id', 'role', 'status', 'lineage_relation'],
  permissions: ['organization_id', 'project_id', 'permissions_json', 'denied_tools_json'],
  runs: ['contract_id', 'contract_version', 'status', 'budget_json']
};

async function socialDiff(req) {
  const db = await getDatabase();
  const { baseObjectId, targetObjectId } = req.body || {};
  if (!baseObjectId || !targetObjectId) return { success: false, error: 'baseObjectId and targetObjectId are required.' };
  const [base, target] = await Promise.all([loadCommit(db, req, baseObjectId), loadCommit(db, req, targetObjectId)]);
  if (!base || !target) return { success: false, error: 'Both commits must exist in the current tenant.' };
  const verification = verifySnapshots([base, target]);
  if (!verification.verified) return { success: false, operation: 'social-diff', error: 'Snapshot verification failed.', verification };
  const changes = Object.keys(SOCIAL_FIELDS).flatMap((section) => compareRecords({
    section,
    before: parseState(base.state_json)[section],
    after: parseState(target.state_json)[section]
  }));
  return { success: true, operation: 'social-diff', baseObjectId, targetObjectId, changes };
}

function verifySnapshots(snapshots) {
  const { verifySource } = require('./verifiedMerge.cjs');
  const issues = snapshots.flatMap(verifySource);
  return { verified: issues.length === 0, issues };
}

async function loadCommit(db, req, objectId) {
  const scopeSql = require('./index').scopeSql;
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

function parseState(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return {}; }
}

function compareRecords(ctx) {
  const before = new Map((Array.isArray(ctx.before) ? ctx.before : []).map((item) => [identityOf(ctx.section, item), item]));
  const after = new Map((Array.isArray(ctx.after) ? ctx.after : []).map((item) => [identityOf(ctx.section, item), item]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].filter((id) => id !== undefined).flatMap((id) => recordChange({ ...ctx, id, before: before.get(id), after: after.get(id) }));
}

function recordChange(ctx) {
  if (!ctx.before) return [{ section: ctx.section, id: ctx.id, change: 'added', after: ctx.after }];
  if (!ctx.after) return [{ section: ctx.section, id: ctx.id, change: 'removed', before: ctx.before }];
  const fields = SOCIAL_FIELDS[ctx.section].filter((key) => JSON.stringify(ctx.before[key]) !== JSON.stringify(ctx.after[key]));
  return fields.length ? [{ section: ctx.section, id: ctx.id, change: 'modified', fields, before: ctx.before, after: ctx.after }] : [];
}

module.exports = { socialDiff, compareRecords };
