'use strict';

/**
 * Rebase sémantique (points 9/10 de l'audit) — extrait de gitOperations.js
 * pour respecter la limite de 400 lignes/fichier.
 *
 * Point 9 : le patch de chaque commit rejoué est diff(previousOriginal, commit)
 * où previousOriginal démarre à BASE (pas ONTO) — le premier patch est
 * diff(BASE, A) appliqué à ONTO.
 * Point 10 : mode normal = un commit A', B', C' par commit d'origine, chaînés
 * (B'.parent = A', A'.parent = ONTO). Mode squash (body.squash || body.mode
 * === 'squash') = un seul commit final.
 */

const { getCommit, findMergeBase } = require('./commitGraph');
const { computePatch } = require('./dagOperations');
const { applyOperationToState } = require('./dagOperations');
const { storeObject } = require('./storeObjectHelper.cjs');
const { updateRef } = require('./refs');
const { getDatabase } = require('../../db');

function scopeSql(req, alias = 'w') {
  if (!req.tenant) return { clause: '1 = 1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [req.tenant.organizationId, req.tenant.projectId] };
}

async function getObjectScoped(db, req, objectId) {
  const scope = scopeSql(req, 'w');
  return db.get(`SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`, objectId, ...scope.params);
}

async function rebase(req) {
  const db = await getDatabase();
  const ontoId = req.body?.ontoObjectId;
  const headId = req.body?.headObjectId || req.body?.oursObjectId;

  if (!ontoId || !headId) return { success: false, error: 'Both ontoObjectId and headObjectId are required.' };

  const onto = await getObjectScoped(db, req, ontoId);
  const head = await getObjectScoped(db, req, headId);
  if (!onto || !head) return { success: false, error: 'Both commits must exist.' };

  const base = await findMergeBase(db, headId, ontoId);
  const squash = req.body?.squash === true || req.body?.mode === 'squash';
  const replayedIds = [];
  const replay = await replayCommits({ db, base, onto, headId, replayedIds, squash });
  // Bug audit #3 : comme cherry-pick/revert (point 5), le rebase doit ÉCRIRE
  // l'état résultant dans la DB — sinon les commits A'/B' capturent un état
  // fantôme et l'agent reste sur son ancien état (prouvé: DB != commit final).
  const targetAgentId = req.body?.targetAgentId || head.agent_id;
  const { replaceState } = require('./dagOperations');
  await replaceState(req, {
    targetAgentId,
    state: replay.currentState,
    sections: ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']
  });
  const commitResult = await commitRebase({ db, req, onto, head, base, currentState: replay.currentState, replayedIds, ontoId, replayed: replay.replayedCommits });
  return finalizeRebase({ db, req, head, commitResult, replayedIds, base });
}

async function finalizeRebase(ctx) {
  const { db, req, head, commitResult, replayedIds, base } = ctx;
  const targetAgentId = req.body?.targetAgentId || head.agent_id;
  const refName = req.body?.refName || head.ref_name || 'main';
  await updateRef({ db, req, agentId: targetAgentId, refName, objectId: commitResult.id, options: { action: 'rebase' } });
  return {
    success: true,
    operation: 'rebase',
    ...commitResult,
    replayedCommits: replayedIds,
    newCommits: commitResult.replayedNewCommitIds || [],
    mergeBase: base?.id || null
  };
}

async function replayCommits(ctx) {
  const { db, base, onto, headId, replayedIds, squash } = ctx;
  const commitsToReplay = await collectCommitsToReplay(db, base, headId);
  const ontoState = JSON.parse(onto.state_json);
  let currentState = { ...ontoState };
  // Point 9 : previousOriginalState démarre à BASE — le patch du premier
  // commit est diff(BASE, A), appliqué à ONTO. L'ancienne initialisation
  // prevState = ONTO produisait diff(ONTO, A), sémantiquement faux.
  let previousOriginal = base ? JSON.parse(base.state_json) : { ...ontoState };
  const replayedCommits = [];

  for (const commit of commitsToReplay) {
    const commitState = JSON.parse(commit.state_json);
    const patch = computePatch(previousOriginal, commitState);
    currentState = applyPatchToState(currentState, patch);
    // Bug audit #2 : l'état de l'agent est PARTAGÉ entre branches (collectState
    // lit toute la DB de l'agent) — ontoState contient déjà les items des
    // commits rejoués. Un ADD sur un item déjà présent créait un DOUBLON
    // (prouvé: y1 apparaissait 2x). Déduplication par identité de section.
    currentState = dedupeSections(currentState);
    previousOriginal = commitState;
    replayedIds.push(commit.id);
    if (!squash) replayedCommits.push({ id: commit.id, state: currentState });
  }
  return { currentState, replayedCommits };
}

// Déduplique chaque section d'état par identité stable (identityOf), en
// gardant la DERNIÈRE occurrence (celle du patch le plus récent).
function dedupeSections(state) {
  const { identityOf } = require('./sectionIdentity.cjs');
  const result = { ...state };
  for (const section of ['decisions', 'memories', 'runs', 'plasmids', 'permissions']) {
    if (!Array.isArray(result[section])) continue;
    const byId = new Map();
    for (const item of result[section]) {
      const id = identityOf(section, item);
      byId.set(id === undefined ? Symbol.for(String(Math.random())) : id, item);
    }
    result[section] = [...byId.values()];
  }
  return result;
}

async function collectCommitsToReplay(db, base, headId) {
  let currentId = headId;
  const commits = [];
  while (currentId && currentId !== base?.id) {
    const commit = await getCommit(db, currentId);
    if (!commit) break;
    commits.unshift(commit);
    currentId = commit.parentIds && commit.parentIds.length > 0 ? commit.parentIds[0] : null;
  }
  return commits;
}

function applyPatchToState(state, patch) {
  const newState = { ...state };
  for (const op of patch.operations) {
    if (!op.section) continue;
    applyOperationToState(newState, op);
  }
  return newState;
}

async function commitRebase(ctx) {
  const { db, req, onto, head, base, currentState, replayedIds, ontoId, replayed } = ctx;
  const targetAgentId = req.body?.targetAgentId || head.agent_id;
  const refName = req.body?.refName || onto.ref_name || 'main';

  // Point 10 : mode normal — chaque commit rejoué devient un commit A', B', C'
  // chaînés (parent = commit rebase précédent, ou ONTO pour le premier).
  if (Array.isArray(replayed) && replayed.length > 0) {
    return replayChain({ db, req, onto, head, base, ontoId, replayed, targetAgentId, refName });
  }

  // Mode squash (ou rien à rejouer) : un seul commit final.
  const stateForStore = buildRebaseStoreState(currentState, onto, head);
  return storeObject(db, {
    agentId: targetAgentId,
    workspaceId: head.workspace_id,
    kind: 'commit',
    refName,
    state: stateForStore,
    createdBy: req.user?.username || 'agent-git',
    metadata: {
      rebaseFrom: req.body?.headObjectId || req.body?.oursObjectId,
      rebaseOnto: ontoId,
      mergeBase: base?.id || null,
      replayedCommits: replayedIds
    },
    parentCommitId: ontoId
  });
}

async function replayChain(ctx) {
  const { db, req, onto, head, base, ontoId, replayed, targetAgentId, refName } = ctx;
  let parentId = ontoId;
  let last = null;
  const newCommitIds = [];
  for (const step of replayed) {
    last = await storeObject(db, {
      agentId: targetAgentId,
      workspaceId: head.workspace_id,
      kind: 'commit',
      refName,
      state: buildRebaseStoreState(step.state, onto, head),
      createdBy: req.user?.username || 'agent-git',
      metadata: { rebaseReplayOf: step.id, rebaseOnto: ontoId, mergeBase: base?.id || null },
      parentCommitId: parentId
    });
    newCommitIds.push(last.id);
    parentId = last.id;
  }
  return { ...last, replayedNewCommitIds: newCommitIds };
}

function buildRebaseStoreState(currentState, onto, head) {
  return {
    ...currentState,
    agent: {
      ...(currentState.agent || {}),
      ...(JSON.parse(onto.state_json).agent || {}),
      ...(JSON.parse(head.state_json).agent || {})
    },
    schema: 'genos.agent-git-state/v1'
  };
}

module.exports = { rebase };
