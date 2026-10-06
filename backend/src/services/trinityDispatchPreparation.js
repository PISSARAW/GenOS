'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { copyTree, createExclusionFilter } = require('./agentWorkspaceLifecycle/copy');
const { maxCopyBytes } = require('./agentWorkspaceLifecycle/constants');
const { normalizeRelativePath, resolveContainedPath } = require('./pathSafety');
const { hashWorkspace } = require('./trinitySnapshotService');
const experiments = require('./trinityExperimentStore');
const trinity = require('./trinityService');

async function prepare(db, input) {
  const { context, parent, missionId, mission, members, selection } = input;
  const source = parent.workspace_root || context.request.workspace_root || context.repoRoot;
  const segment = normalizeRelativePath(missionId, 'Trinity mission');
  if (segment.includes('/') || segment.includes('\\')) throw new Error('Trinity mission ID must be a path segment.');
  const directory = resolveContainedPath(context.repoRoot, `.genos-agent-worlds/trinity-snapshots/${segment}`, 'Trinity snapshot');
  const budget = budgetPolicy(context.request, members.length, selection);
  const prior = await db.get('SELECT design_json, budget_policy_json, mission_snapshot_hash, status FROM trinity_experiments WHERE id = ?', missionId);
  if (prior) return replayPreparation(prior, { mission, selection, budget, directory });
  const snapshot = await require('./trinitySealedSnapshot').seal({ repoRoot: context.repoRoot, source, missionId });
  const snapshotHash = snapshot.hash;
  const design = dispatchDesign(input, directory);
  await experiments.create(db, { id: missionId, missionId, domain: trinity.analyzeMission(mission).domain,
    snapshotHash, design, budgetPolicy: budget,
    isolationPolicy: { sharedMemory: 'read-only-snapshot', communication: 'forbidden', provenanceTracking: 'full' } });
  return { snapshotRoot: directory, snapshotHash, budget, design };
}

function dispatchDesign(input, directory) {
  const { context, mission, selection } = input;
  const supplied = context.request.trinityHypothesisDesign || context.request.trinity_hypothesis_design || {};
  return { ...trinity.designHypotheses(mission, { ...supplied,
    integrationChecks: context.request.trinityIntegrationChecks || supplied.integrationChecks,
    claimVerificationChecks: context.request.trinityClaimVerificationChecks || supplied.claimVerificationChecks }),
  dispatchMission: mission, variantSelection: selection, statisticalContract: context.request.trinityStatisticalContract, juryConfig: context.request.trinityJury || context.request.trinity_jury,
  snapshotRoot: directory, orchestratorId: context.orchestratorId };
}

const budgetPolicy = require('./trinityBudgetPolicy').allocate;

async function sourceFor(db, input) {
  const scope = input.context.request.missionScope;
  if (!scope?.trinityExperimentId) return input.parent.workspace_root || process.env.GENOS_WORKSPACE_ROOT || input.context.repoRoot;
  const row = await db.get('SELECT design_json FROM trinity_experiments WHERE id = ?', scope.trinityExperimentId);
  const world = await db.get('SELECT agent_id FROM trinity_worlds WHERE experiment_id = ? AND agent_id = ?', scope.trinityExperimentId, input.context.id);
  const design = JSON.parse(row?.design_json || '{}');
  if (!world || design.orchestratorId !== input.context.orchestratorId || !design.snapshotRoot) {
    throw Object.assign(new Error('Trinity worker is not bound to this sealed experiment.'), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  }
  return design.snapshotRoot;
}

async function bindWorker(db, input) {
  const scope = input.scope;
  if (!scope?.trinityExperimentId) return null;
  const row = await db.get('SELECT mission_snapshot_hash FROM trinity_experiments WHERE id = ?', scope.trinityExperimentId);
  if (await hashWorkspace(input.workspaceRoot) !== row?.mission_snapshot_hash) {
    throw Object.assign(new Error('Trinity worker snapshot mismatch.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
  }
  return require('../db').withTransaction(db, tx => registerPrivateWorkspace(tx, { ...input, snapshotHash: row.mission_snapshot_hash }));
}

async function registerPrivateWorkspace(db, input) {
  const id = 'trinity_workspace_' + input.workerId;
  const existing = await db.get('SELECT path FROM workspaces WHERE id = ?', id);
  if (existing && existing.path !== input.workspaceRoot) throw Object.assign(new Error('Trinity worker workspace identity changed.'), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  const tenant = await db.get('SELECT w.organization_id, w.project_id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', input.workerId);
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path, visibility, language, tags, organization_id, project_id) VALUES (?, ?, ?, 'Private', 'Mixed', ?, ?, ?)",
    id, 'Trinity ' + input.workerId, input.workspaceRoot, JSON.stringify(['trinity_world', 'sealed']), tenant?.organization_id || null, tenant?.project_id || null);
  const agent = await db.run('UPDATE agents SET workspace_id = ? WHERE id = ?', id, input.workerId);
  const world = await db.run('UPDATE trinity_worlds SET workspace_root = ?, snapshot_hash = ?, status = ? WHERE agent_id = ? AND experiment_id = ?',
    input.workspaceRoot, input.snapshotHash, 'running', input.workerId, input.scope.trinityExperimentId);
  if (agent.changes !== 1 || world.changes !== 1) throw Object.assign(new Error('Trinity worker binding disappeared.'), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  return id;
}

async function replayPreparation(row, input) {
  const design = JSON.parse(row.design_json);
  if ((design.dispatchMission || design.centralProblem) !== input.mission || JSON.stringify(design.variantSelection) !== JSON.stringify(input.selection)) {
    throw Object.assign(new Error('Trinity mission identity conflicts with its sealed design.'), { code: 'TRINITY_EXPERIMENT_ID_CONFLICT' });
  }
  const budget = JSON.parse(row.budget_policy_json);
  if (JSON.stringify(budget) !== JSON.stringify(input.budget) || design.snapshotRoot !== input.directory) {
    throw Object.assign(new Error('Trinity sealed budget or snapshot identity changed.'), { code: 'TRINITY_EXPERIMENT_ID_CONFLICT' });
  }
  if (await hashWorkspace(design.snapshotRoot) !== row.mission_snapshot_hash) {
    throw Object.assign(new Error('Trinity sealed snapshot was modified.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
  }
  return { snapshotRoot: design.snapshotRoot, snapshotHash: row.mission_snapshot_hash,
    budget, design, status: row.status, idempotent: true };
}
function restrictLease(scope, lease) {
  if (!scope?.trinityExperimentId) return lease;
  const shared = new Set(['genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session', 'genos_change_organization']);
  return lease.filter(tool => !shared.has(tool));
}
module.exports = { prepare, sourceFor, bindWorker, budgetPolicy, restrictLease };
