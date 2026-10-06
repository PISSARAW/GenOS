'use strict';

const fs = require('fs/promises');
const path = require('path');
const snapshots = require('./workspaceSnapshotStore');
const { error, hash } = require('./garageRequests');

async function capture(input, row) {
  const worker = await input.db.get('SELECT workspace_id FROM agents WHERE id = ?', row.worker_id);
  const workspace = await input.db.get('SELECT id, path FROM workspaces WHERE id = ?', worker.workspace_id);
  const tracked = require('./agentWorkspaceLifecycleService').trackedWorkspaces().find((entry) => entry.agentId === row.worker_id);
  const persisted = await input.db.get('SELECT workspace_root FROM agent_capsule_cleanup WHERE agent_id = ?', row.worker_id);
  const source = tracked?.workspaceRoot || persisted?.workspace_root;
  if (!workspace || !source) throw error('GARAGE_SNAPSHOT_REQUIRED', 'No isolated runtime workspace is available.');
  const realSource = await fs.realpath(source);
  const realWorkspace = await fs.realpath(workspace.path);
  if (realSource === realWorkspace) throw error('GARAGE_ISOLATION_REQUIRED', 'Shared workspace cannot be frozen as an isolated worker.');
  assertWorkerSource(realSource, row.worker_id);
  const snapshot = await snapshots.capture({ db: input.db, workspace, sourcePath: realSource,
    agentId: row.worker_id, reason: 'Garage Fabric verified suspension', label: `Garage ${row.request_id}` });
  const request = JSON.parse(row.request_json);
  const binding = JSON.parse(row.result_json || '{}');
  const run = binding.runId ? await input.db.get('SELECT budget_json, metrics_json FROM strategy_execution_runs WHERE id = ? AND agent_id = ?', binding.runId, row.worker_id) : null;
  if (run) request.executionBudget = { ...JSON.parse(run.budget_json), deterministic: request.executionBudget?.deterministic === true };
  return { version: 1, workerId: row.worker_id, orchestratorId: row.orchestrator_id,
    workspaceId: workspace.id, request, snapshot, budgetMeasured: Boolean(run), consumed: JSON.parse(run?.metrics_json || '{}') };
}

function remainingBudget(state) {
  if (state.budgetMeasured === false) throw error('GARAGE_BUDGET_UNKNOWN', 'No persisted execution allocation/consumption receipt.');
  const budget = { ...state.request.executionBudget };
  for (const key of ['tokens', 'costUsd', 'events', 'latencyMs']) {
    if (budget[key] === undefined) continue;
    if (!Number.isFinite(Number(state.consumed[key])) || Number(state.consumed[key]) < 0) throw error('GARAGE_BUDGET_UNKNOWN', 'A budget dimension has no valid consumption receipt.');
    budget[key] = Math.max(0, Number(budget[key]) - Number(state.consumed[key] || 0));
    if (budget[key] <= 0 && !(key === 'tokens' && budget.deterministic === true)) throw error('GARAGE_BUDGET_EXHAUSTED', 'Suspended mission has no remaining budget.');
  }
  return budget;
}

async function restore(input, capsule) {
  if (hash(JSON.parse(capsule.state_json)) !== capsule.capsule_hash) throw error('GARAGE_CAPSULE_CORRUPT', 'Capsule checksum mismatch.');
  const state = JSON.parse(capsule.state_json);
  if (state.workerId !== input.workerId || state.orchestratorId !== input.orchestratorId) throw error('GARAGE_SCOPE_INVALID', 'Capsule identity mismatch.');
  const budget = remainingBudget(state);
  const workspace = await input.db.get('SELECT id, path FROM workspaces WHERE id = ?', state.workspaceId);
  const snapshot = await snapshots.getSnapshot(input.db, workspace.id, state.snapshot.id);
  if (snapshot.snapshot_hash !== state.snapshot.snapshotHash) throw error('GARAGE_CAPSULE_CORRUPT', 'Snapshot binding mismatch.');
  await snapshots.readManifest(snapshot);
  if (path.basename(input.workerId) !== input.workerId) throw error('GARAGE_SCOPE_INVALID', 'Invalid worker path identity.');
  const capsuleRoot = await require('./workspaceSnapshotPaths').assertNoSymlinkPath(workspace.path, '.genos-agent-worlds');
  await fs.mkdir(capsuleRoot, { recursive: true });
  const destination = await fs.mkdtemp(path.join(capsuleRoot, `${input.workerId}_garage_`));
  await snapshots.materialize(snapshot, destination);
  return { ...state.request, executionBudget: budget, workspaceRoot: destination,
    workspaceProvisioned: true, resumedFrom: capsule.snapshot_id };
}

function assertWorkerSource(source, workerId) {
  const basename = path.basename(source);
  if (!(basename === workerId || basename.startsWith(`${workerId}_`))) throw error('GARAGE_SCOPE_INVALID', 'Snapshot source belongs to another worker.');
  const configured = process.env.GENOS_CAPSULE_ROOT;
  const relative = configured && path.relative(path.resolve(configured), source);
  const managed = source.split(/[\\/]/).includes('.genos-agent-worlds');
  if (!managed && !(relative && !relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw error('GARAGE_ISOLATION_REQUIRED', 'Snapshot source is not a managed worker capsule.');
  }
}

module.exports = { capture, restore, remainingBudget, assertWorkerSource };
