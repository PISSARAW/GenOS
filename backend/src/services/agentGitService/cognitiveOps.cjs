'use strict';

const { getDatabase } = require('../../db');
const { identityOf } = require('./sectionIdentity.cjs');

const COGNITIVE_SECTIONS = ['decisions', 'memories'];

async function cognitiveDiff(req) {
  const db = await getDatabase();
  const { baseObjectId, targetObjectId } = req.body || {};
  if (!baseObjectId || !targetObjectId) {
    return { success: false, error: 'baseObjectId and targetObjectId are required.' };
  }
  const [base, target] = await Promise.all([
    getScopedObject(db, req, baseObjectId),
    getScopedObject(db, req, targetObjectId)
  ]);
  if (!base || !target) return { success: false, error: 'Both commits must exist in the current tenant.' };
  const verification = verifySnapshots([base, target]);
  if (!verification.verified) return { success: false, operation: 'cognitive-diff', error: 'Snapshot verification failed.', verification };
  return {
    success: true,
    operation: 'cognitive-diff',
    baseObjectId,
    targetObjectId,
    changes: COGNITIVE_SECTIONS.flatMap((section) => compareSection({
      section,
      before: parseState(base.state_json)[section],
      after: parseState(target.state_json)[section]
    }))
  };
}

function verifySnapshots(snapshots) {
  const { verifySource } = require('./verifiedMerge.cjs');
  const issues = snapshots.flatMap(verifySource);
  return { verified: issues.length === 0, issues };
}

async function getScopedObject(db, req, objectId) {
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

function compareSection(ctx) {
  const before = Array.isArray(ctx.before) ? ctx.before : [];
  const after = Array.isArray(ctx.after) ? ctx.after : [];
  const oldItems = new Map(before.map((item) => [identityOf(ctx.section, item), item]));
  const newItems = new Map(after.map((item) => [identityOf(ctx.section, item), item]));
  const ids = new Set([...oldItems.keys(), ...newItems.keys()]);
  return [...ids].filter((id) => id !== undefined).flatMap((id) => {
    const oldItem = oldItems.get(id);
    const newItem = newItems.get(id);
    if (!oldItem) return [{ section: ctx.section, id, change: 'added', after: newItem }];
    if (!newItem) return [{ section: ctx.section, id, change: 'removed', before: oldItem }];
    const facets = changedFacets(ctx.section, oldItem, newItem);
    return facets.length ? [{ section: ctx.section, id, change: 'modified', facets, before: oldItem, after: newItem }] : [];
  });
}

function changedFacets(section, before, after) {
  const keys = section === 'decisions'
    ? { content: ['title', 'content', 'category'], evidence: ['cart_nodes_json'], confidence: ['synaptic_weight'] }
    : { action: ['action_type', 'action_input'], observation: ['observation_output'], context: ['context_state'], outcome: ['reward_score'] };
  return Object.entries(keys).filter(([, fields]) => fields.some((field) => !same(before[field], after[field])))
    .map(([facet]) => facet);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

module.exports = { cognitiveDiff, compareSection, changedFacets, verifySnapshots };
