'use strict';

const { getDatabase } = require('../../db');

function validateActions(actions) {
  const conflicts = [];
  actions.forEach((item, index) => {
    if (item.action === 'edit' && !item.state) conflicts.push({ index, reason: 'edit requires state' });
  });
  return conflicts;
}

function mergeObjects(actions, objects) {
  let merged = {};
  for (const [index, item] of actions.entries()) {
    if (item.action === 'drop') continue;
    const next = item.action === 'edit' ? item.state : JSON.parse(objects[index].state_json);
    merged = { ...merged, ...next, agent: { ...(merged.agent || {}), ...(next.agent || {}) } };
  }
  return merged;
}

async function rebaseInteractive(req) {
  const db = await getDatabase();
  // Load dependencies dynamically to avoid circular dependency at module load time
  const { getObject, storeObject } = require('./index');
  const ids = Array.isArray(req.body?.objectIds) ? req.body.objectIds : [];
  if (!ids.length) return { success: false, error: 'objectIds are required.' };
  const objects = [];
  for (const id of ids) { const object = await getObject(db, req, id); if (!object) return { success: false, error: `Object '${id}' not found.` }; objects.push(object); }
  const actions = req.body?.actions || ids.map(() => ({ action: 'pick' }));
  const conflicts = validateActions(actions);
  if (conflicts.length) return { success: false, operation: 'rebase-interactive', conflict: true, conflicts, plan: actions };
  const merged = mergeObjects(actions, objects);
  const agentId = req.body?.targetAgentId || objects[0].agent_id;
  const commit = await storeObject(db, { agentId, workspaceId: merged.agent?.workspace_id, kind: 'commit', refName: req.body?.refName || 'main', state: merged, createdBy: req.user?.username || 'agent-git', metadata: { interactiveRebase: ids, actions } });
  return { success: true, operation: 'rebase-interactive', ...commit, appliedActions: actions };
}

module.exports = rebaseInteractive;
