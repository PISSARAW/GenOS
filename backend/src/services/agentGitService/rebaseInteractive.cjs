'use strict';

const { getDatabase, withTransaction } = require('./agentGitDb.cjs');
const { getCommit } = require('./commitGraph');
const { storeObject } = require('./storeObjectHelper.cjs');
const { updateRef } = require('./refs');
const { verifySource } = require('./verifiedMerge.cjs');
const { validateActions, planReplay } = require('./rebaseInteractivePlan.cjs');

async function loadPlan(db, req, ids) {
  const { getObject } = require('./index');
  const commits = [];
  for (const id of ids) {
    const object = await getObject(db, req, id);
    if (!object) throw new Error(`Commit ${id} is unavailable in the current tenant.`);
    commits.push(object);
  }
  const firstGraph = await getCommit(db, ids[0]);
  const parentId = firstGraph?.parentIds?.[0];
  if (!parentId) throw new Error('Interactive rebase requires an existing base commit.');
  const base = await getObject(db, req, parentId);
  const ontoId = req.body?.ontoObjectId || parentId;
  const onto = await getObject(db, req, ontoId);
  if (!base || !onto || ids.includes(ontoId)) throw new Error('Rebase base or onto commit is unavailable.');
  for (const [index, object] of commits.entries()) {
    const graph = await getCommit(db, object.id);
    if (graph?.parentIds?.[0] !== (index ? ids[index - 1] : parentId)) {
      throw new Error('Interactive rebase commits must form a contiguous first-parent chain.');
    }
  }
  const scope = [base, onto, ...commits];
  if (scope.some((item) => item.agent_id !== commits[0].agent_id || item.workspace_id !== commits[0].workspace_id)) {
    throw new Error('Interactive rebase cannot cross an agent or workspace.');
  }
  const issues = scope.flatMap(verifySource);
  if (issues.length) throw new Error(`Commit verification failed: ${JSON.stringify(issues)}`);
  const refName = req.body?.refName || commits.at(-1).ref_name || 'main';
  const ref = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    commits[0].agent_id, refName);
  if (ref?.object_id !== ids.at(-1)) throw new Error('Target ref does not point to the series head.');
  return { commits, base, onto, refName, refVersion: Number(ref.version), agentId: commits[0].agent_id,
    workspaceId: commits[0].workspace_id };
}

async function persistPlan(db, req, context) {
  const { plan, source } = context;
  const current = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    source.agentId, source.refName);
  if (current?.object_id !== source.commits.at(-1).id || Number(current.version) !== source.refVersion) {
    throw new Error('Target ref changed during interactive rebase.');
  }
  let parentId = source.onto.id;
  const newCommits = [];
  for (const step of plan.planned) {
    const stored = await storeObject(db, { agentId: source.agentId, workspaceId: source.workspaceId,
      kind: 'commit', refName: source.refName, state: step.state,
      createdBy: req.user?.username || 'agent-git', parentCommitId: parentId,
      metadata: { interactiveRebase: true, rebasedFrom: step.sources, message: step.message,
        rebaseOnto: source.onto.id } });
    parentId = stored.id;
    newCommits.push(stored.id);
  }
  await require('./dagOperations').replaceState(req, { targetAgentId: source.agentId,
    state: plan.finalState, sections: ['agent', 'decisions', 'memories', 'runs', 'plasmids',
      'permissions', 'relations', 'epistemicClaims'] }, { inTransaction: true });
  await updateRef({ db, req, agentId: source.agentId, refName: source.refName, objectId: parentId,
    options: { action: 'rebase-interactive', expectedVersion: source.refVersion, inTransaction: true } });
  return { objectId: parentId, newCommits };
}

async function rebaseInteractive(req) {
  const ids = req.body?.objectIds;
  const actions = req.body?.actions || ids?.map(() => ({ action: 'pick' }));
  validateActions(ids, actions);
  const db = await getDatabase();
  const source = await loadPlan(db, req, ids);
  const plan = planReplay(JSON.parse(source.onto.state_json), source.commits, actions,
    JSON.parse(source.base.state_json));
  const committed = await withTransaction(db, () => persistPlan(db, req, { source, plan }));
  return { success: true, operation: 'rebase-interactive', ontoObjectId: source.onto.id,
    originalCommits: ids, appliedActions: actions.map((item) => item.action),
    ...committed };
}

module.exports = rebaseInteractive;
