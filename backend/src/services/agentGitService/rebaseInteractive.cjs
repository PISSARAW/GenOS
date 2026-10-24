'use strict';

const { getDatabase } = require('../../db');
const { getCommit } = require('./commitGraph');
const { updateRef } = require('./refs');

function validateActions(actions) {
  const conflicts = [];
  actions.forEach((item, index) => {
    if (item.action === 'edit' && !item.state) conflicts.push({ index, reason: 'edit requires state' });
  });
  return conflicts;
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

  const agentId = req.body?.targetAgentId || objects[0].agent_id;
  const refName = req.body?.refName || 'main';

  // Rejouer séquentiellement chaque action en chaînant les nouveaux commits
  // (chaque commit a pour parent le précédent créé, ou le parent du premier objet).
  let previousCommitId = null;
  let currentState = null;
  const appliedActions = [];

  for (const [index, item] of actions.entries()) {
    if (item.action === 'drop') { appliedActions.push({ index, action: 'drop', skipped: true }); continue; }
    const source = objects[index];
    const nextState = item.action === 'edit' ? item.state : JSON.parse(source.state_json);
    currentState = nextState;

    let parentCommitIds = [];
    if (previousCommitId) {
      parentCommitIds = [previousCommitId];
    } else {
      const firstCommit = await getCommit(db, source.id);
      if (firstCommit && firstCommit.parentIds && firstCommit.parentIds.length > 0) {
        parentCommitIds = [firstCommit.parentIds[0]];
      }
    }

    const commitResult = await storeObject(db, {
      agentId,
      workspaceId: source.workspace_id,
      kind: 'commit',
      refName,
      state: currentState,
      createdBy: req.user?.username || 'agent-git',
      metadata: { interactiveRebase: ids, actions, rebasedFrom: source.id, action: item.action },
      parentCommitIds
    });
    previousCommitId = commitResult.id;
    appliedActions.push({ index, action: item.action, objectId: commitResult.id, parentCommitIds });
  }

  if (!previousCommitId) {
    return { success: false, operation: 'rebase-interactive', error: 'No commits to replay (all dropped).' };
  }

  // Mettre à jour la ref via le chemin sécurisé (contrôle de version, lease, reflog).
  await updateRef({ db, req, agentId, refName, objectId: previousCommitId, options: { action: 'rebase-interactive' } });

  return { success: true, operation: 'rebase-interactive', objectId: previousCommitId, appliedActions };
}

module.exports = rebaseInteractive;
