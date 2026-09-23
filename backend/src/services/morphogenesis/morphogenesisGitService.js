'use strict';

/**
 * Morphogenesis Git Integration — auto-commit on topology change.
 *
 * Every topology transition (spawn, retire, rebind) produces a commit in
 * agent_git_commits with parent, changes, reason, evidence. Bridges
 * transitionEngineService → agentGitService so every morphogenesis is
 * versioned as a Git commit.
 */

const crypto = require('crypto');
const { executeTransition } = require('./transitionEngineService');
const { createCommit, collectState, updateRef } = require('../agentGitService');
const { recordFossil } = require('../fossilizationService');

function uuid() { return crypto.randomUUID(); }

function collectActionChanges(receipt) {
  const changes = [];
  for (const a of receipt.actionsTaken || []) {
    if (a.status === 'success' && a.detail) {
      changes.push({
        type: a.type,
        agentId: a.detail.agentId,
        role: a.detail.role,
        descriptor: a.detail.descriptor ? { id: a.detail.descriptor.agentId } : undefined,
      });
    }
  }
  return changes;
}

function pushMapped(changes, items, mapFn) {
  if (!Array.isArray(items)) return changes;
  for (const it of items) changes.push(mapFn(it));
  return changes;
}

function collectPlanChanges(plan) {
  let changes = [];
  pushMapped(changes, plan.topologyChanges, (t) => ({ type: 'topology', field: t.field, from: t.from, to: t.to }));
  pushMapped(changes, plan.preserveAgents, (a) => ({ type: 'preserve', agentId: a.agentId || a.id }));
  pushMapped(changes, plan.retireAgents, (a) => ({ type: 'retire', agentId: a.agentId || a.id }));
  pushMapped(changes, plan.spawnAgents, (s) => ({ type: 'spawn', phenotype: s.phenotype, capabilities: s.capabilities }));
  pushMapped(changes, plan.rebindAgents, (r) => ({ type: 'rebind', agentId: r.agentId || r.id }));
  pushMapped(changes, plan.capabilityChanges, (c) => ({ type: 'capability', capability: c.capability, action: c.action }));
  pushMapped(changes, plan.leaseChanges, (l) => ({ type: 'lease', lease: l.lease || l.tool, action: l.action }));
  pushMapped(changes, plan.relationChanges, (r) => ({ type: 'relation', relation: r.relation || r.kind }));
  pushMapped(changes, plan.plasmidActions, (p) => ({ type: 'plasmid', action: p.action, plasmidId: p.plasmidId }));
  pushMapped(changes, plan.genotypeActions, (g) => ({ type: 'dna', action: g.action, targetAgentId: g.targetAgentId }));
  pushMapped(changes, plan.epigeneticChanges, (e) => ({ type: 'epigenetic', agentId: e.agentId }));
  if (plan.budgetReallocation || plan.budgetPatch) {
    changes.push({ type: 'budget', reallocation: plan.budgetReallocation, patch: plan.budgetPatch });
  }
  if (plan.executionSubstrate) {
    changes.push({ type: 'substrate', substrate: plan.executionSubstrate });
  }
  return changes;
}

function buildEvidence(plan, receipt) {
  return {
    transitionId: receipt.transitionId,
    planId: plan.id,
    preVersion: receipt.preStateSnapshot?.morphologyVersion,
    postVersion: receipt.postStateSnapshot?.morphologyVersion,
    actionCount: receipt.actionsTaken?.length || 0,
    rollback: receipt.rollbackReceipt ? true : false,
    targetOrganization: plan.targetOrganization || null,
    counterfactual: plan.counterfactualRef || receipt.counterfactualRef || null,
  };
}

function attachCounterfactual(plan, receipt, counterfactual) {
  if (!counterfactual) return null;
  const ref = counterfactual.lifecycleId || counterfactual.winner?.worldId || null;
  if (ref && receipt && !receipt.counterfactualRef) receipt.counterfactualRef = ref;
  if (ref && plan && !plan.counterfactualRef) plan.counterfactualRef = ref;
  return ref;
}
function buildReason(plan) {
  if (plan.reason) return plan.reason;
  if (plan.targetOrganization) return `morphogenesis:${plan.targetOrganization}`;
  return 'morphogenesis:auto';
}

/**
 * Build a commit context from a morphogenesis plan and receipt.
 */
function buildCommitContext(plan, receipt, collectiveState) {
  const changes = collectActionChanges(receipt).concat(collectPlanChanges(plan));
  const evidence = buildEvidence(plan, receipt);
  if (collectiveState && evidence.preVersion === undefined) {
    evidence.preVersion = collectiveState.currentMorphologyVersion || null;
  }
  const reason = buildReason(plan);

  return {
    message: `[MORPHOGENESIS] ${plan.targetOrganization || 'transition'} — ${changes.length} change(s)`,
    reason,
    evidence,
    changes,
  };
}

/**
 * Create an AgentGit commit mirroring the morphogenesis result.
 */
async function commitTransition(db, ctx) {
  const { agentId, workspaceId, plan, receipt, req, refName } = ctx;
  const { message, reason, evidence, changes } = buildCommitContext(plan, receipt, ctx.collectiveState);

  const state = await collectState(db, req, agentId);
  if (!state) return null;

  const parentRef = await db.get(
    'SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    agentId, refName
  );
  const parentCommitId = parentRef?.object_id || null;

  const commitReq = {
    user: { username: 'morphogenesis-runtime' },
    tenant: req?.tenant,
    body: {},
  };

  const result = await createCommit(commitReq, {
    agentId,
    refName,
    state,
    metadata: {
      source: 'morphogenesis-runtime',
      transitionId: receipt.transitionId,
      planId: plan.id,
      committed: receipt.committed,
      counterfactual: receipt.counterfactualRef || null,
    },
    parentCommitId,
  });

  // Mirror into agent_git_commits for fast lineage queries
  await db.run(
    `INSERT OR REPLACE INTO agent_git_commits
     (commit_id, agent_id, workspace_id, parent_commit_id, tree_hash, commit_hash,
      state_hash, message, reason, evidence_json, changes_json, committed_by, committed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    result.id,
    agentId,
    workspaceId || state.agent?.workspace_id || null,
    parentCommitId,
    result.tree_hash || result.state_hash,
    result.commit_hash || result.state_hash,
    result.state_hash,
    message,
    reason,
    JSON.stringify(evidence),
    JSON.stringify(changes),
    'morphogenesis-runtime',
    new Date().toISOString()
  );

  // Update ref to point at new commit
  await updateRef({
    db,
    req: commitReq,
    agentId,
    refName,
    objectId: result.id,
    options: { action: 'morphogenesis-commit' },
  });

  return result;
}

/**
 * Execute a morphogenesis transition AND version it as a Git commit.
 * Wraps transitionEngineService.executeTransition.
 */
async function executeVersionedTransition(ctx) {
  const { plan, collectiveState, db, req } = ctx;
  const refName = ctx.refName || 'main';
  const agentId = ctx.agentId || (plan.actions && plan.actions[0]?.agentId) || ctx.parent?.id;

  // Run the transition
  const receipt = await executeTransition(ctx);
  attachCounterfactual(plan, receipt, ctx.counterfactual);

  if (!receipt.committed || !agentId) {
    return { receipt, commit: null };
  }

  // Create commit after successful transition
  const commit = await commitTransition(db, {
    agentId,
    workspaceId: ctx.workspaceId,
    plan,
    receipt,
    req,
    refName,
    collectiveState,
  });

  return { receipt, commit };
}

/**
 * Fossilise an extinct lineage — creates an immutable fossil record
 * AND an AgentGit commit tagged as fossil. The fossil is a dead-end
 * marker: no resurrection, stratigraphic archive only.
 */
async function fossiliseLineage(db, input) {
  const { lineageId, agentId, reason, mode, req } = input;
  if (!lineageId || !agentId) {
    return { success: false, error: 'lineageId and agentId required' };
  }

  // 1. Record the stratigraphic fossil (existing service)
  const fossilResult = await recordFossil(
    { lineageId, agentId, reason: reason || 'Stratigraphic extinction event', mode: mode || 'petrification', writeArtifact: false },
    db,
    { writeArtifact: false }
  );

  if (!fossilResult.success) return fossilResult;

  // 2. Commit the fossil state to AgentGit as a dead-end marker
  const commitReq = {
    user: { username: 'fossil-runtime' },
    tenant: req?.tenant,
    body: {},
  };

  const state = await collectState(db, commitReq, agentId);
  if (state) {
    const tagName = `fossil/${fossilResult.fossil.fossil_id.slice(0, 8)}`;
    const commitResult = await createCommit(commitReq, {
      agentId,
      refName: tagName,
      kind: 'tag',
      state,
      metadata: {
        source: 'fossil-runtime',
        fossil: true,
        fossilId: fossilResult.fossil.fossil_id,
        lineageId,
        immutable: true,
      },
      parentCommitId: null,
    });

    await db.run(
      `INSERT OR REPLACE INTO agent_git_commits
       (commit_id, agent_id, workspace_id, parent_commit_id, tree_hash, commit_hash,
        state_hash, message, reason, evidence_json, changes_json, committed_by, committed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      commitResult.id,
      agentId,
      state.agent?.workspace_id || null,
      null,
      commitResult.tree_hash || commitResult.state_hash,
      commitResult.commit_hash || commitResult.state_hash,
      commitResult.state_hash,
      `[FOSSIL] lineage ${lineageId} extinct — ${reason || 'stratigraphic extinction'}`,
      'fossil:lineage-extinct',
      JSON.stringify({ fossilId: fossilResult.fossil.fossil_id, lineageId }),
      JSON.stringify([]),
      'fossil-runtime',
      new Date().toISOString()
    );

    return { success: true, fossil: fossilResult.fossil, commit: { id: commitResult.id, tagName } };
  }

  return { success: true, fossil: fossilResult.fossil, commit: null };
}

/**
 * Branch a lineage — creates a new ref in agent_git_refs that forks from
 * the parent's main ref. Used for speciation/mitosis events.
 */
async function branchLineage(db, input) {
  const { agentId, parentAgentId, branchName, req } = input;
  if (!agentId || !parentAgentId || !branchName) {
    return { success: false, error: 'agentId, parentAgentId and branchName required' };
  }

  // Get parent's main ref as the fork point
  const parentRef = await db.get(
    'SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    parentAgentId, 'main'
  );
  if (!parentRef?.object_id) {
    return { success: false, error: 'Parent has no main ref to branch from' };
  }

  const commitReq = {
    user: { username: 'lineage-runtime' },
    tenant: req?.tenant,
    body: {},
  };

  // Create the new branch ref pointing at parent's tip
  await updateRef({
    db,
    req: commitReq,
    agentId,
    refName: branchName,
    objectId: parentRef.object_id,
    options: { action: 'lineage-branch' },
  });

  return {
    success: true,
    operation: 'lineage-branch',
    agentId,
    parentAgentId,
    branchName,
    forkPoint: parentRef.object_id,
  };
}

/**
 * Get lineage tree — returns the commit ancestry of an agent as a flat list.
 */
async function getLineage(db, agentId, options = {}) {
  const refName = options.refName || 'main';
  const ref = await db.get(
    'SELECT object_id FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?',
    agentId, refName
  );
  if (!ref?.object_id) return [];

  const tipRow = await db.get(
    'SELECT commit_id FROM agent_git_commits WHERE commit_id = ?',
    ref.object_id
  );
  if (!tipRow) return [];

  const visited = new Set();
  const queue = [ref.object_id];
  const commits = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const commit = await db.get(
      'SELECT * FROM agent_git_commits WHERE commit_id = ?',
      currentId
    );
    if (!commit) continue;

    commits.push({
      commitId: commit.commit_id,
      agentId: commit.agent_id,
      parentCommitId: commit.parent_commit_id,
      message: commit.message,
      reason: commit.reason,
      changes: JSON.parse(commit.changes_json || '[]'),
      evidence: JSON.parse(commit.evidence_json || '{}'),
      committedAt: commit.committed_at,
      committedBy: commit.committed_by,
    });

    if (commit.parent_commit_id) {
      queue.push(commit.parent_commit_id);
    }
  }

  return commits;
}

module.exports = {
  executeVersionedTransition,
  commitTransition,
  fossiliseLineage,
  branchLineage,
  getLineage,
  buildCommitContext,
};
