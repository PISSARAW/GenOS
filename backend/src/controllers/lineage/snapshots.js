/**
 * Agent state snapshot, commit, branch, checkout and restore endpoints.
 */

const { getDatabase, withTransaction } = require('../../db');
const crypto = require('crypto');
const { workspaceScope, loadAgentForScope, readString, actorName, optionalId, orDefault, nullish } = require('./helpers');
const workspaceSnapshots = require('../../services/workspaceSnapshotStore');
const persistedState = require('../../services/organismPersistedState');
const orchestratorCheckpoint = require('../../services/organismOrchestratorCheckpoint');
const runtimeCheckpoint = require('../../services/localRuntimeCheckpoint');
const providerContinuity = require('../../services/organismProviderContinuity');

const RESTORABLE_AGENT_FIELDS = [
  'name', 'name_meaning', 'role', 'model_tier', 'language', 'isolation_mode', 'dissonance_level',
  'eureka_count', 'cognitive_budget', 'cognitive_baseline_budget', 'cognitive_max_dissonance',
  'is_apoptotic', 'status', 'current_task'
];

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function restorableAgentState(agent) {
  return Object.fromEntries(RESTORABLE_AGENT_FIELDS.map((field) => [field, agent[field] ?? null]));
}

function newAgentSnapshotId(prefix = 'agent-state') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadScopedWorkspace(db, scope, workspaceId) {
  return db.get(`SELECT w.id, w.name, w.path FROM workspaces w WHERE w.id = ? AND ${scope.clause}`, workspaceId, ...scope.params);
}

async function captureAgentWorkspace(options) {
  const { db, scope, agent, req, snapshotId, reason } = options;
  if (!agent.workspace_id) return null;
  const workspace = await loadScopedWorkspace(db, scope, agent.workspace_id);
  if (!workspace?.path) {
    throw Object.assign(new Error('The agent workspace is unavailable for a complete state snapshot.'), { code: 'AGENT_WORKSPACE_SNAPSHOT_UNAVAILABLE' });
  }
  const snapshot = await workspaceSnapshots.capture({
    db,
    workspace,
    label: `Agent state ${snapshotId}`,
    reason,
    author: actorName(req),
    agentId: agent.id,
    branchId: req.body?.refName || 'main',
    genome: { id: agent.genome_id || null },
    state: { agentStateSnapshotId: snapshotId, status: agent.status, currentTask: agent.current_task || null },
    worldId: req.body?.worldId || 'world-main'
  });
  return { id: snapshot.id, hash: snapshot.snapshotHash, workspaceId: workspace.id };
}

function encodeAgentSnapshot(agent, workspaceSnapshot, extras) {
  const { capturedAt, persisted, orchestrator } = extras;
  const agentState = restorableAgentState(agent);
  const continuation = providerContinuity.references(persisted.sections.modelTurns);
  let resumableRuntime = null;
  try { resumableRuntime = runtimeCheckpoint.resumable(persisted.sections.runtime); }
  catch (_) { /* Preserve an unsafe pre-restore safety snapshot without claiming resumability. */ }
  const components = {
    agentState: { status: 'captured', hash: digest(agentState) },
    workspace: workspaceSnapshot
      ? { status: 'captured', snapshotId: workspaceSnapshot.id, hash: workspaceSnapshot.hash }
      : { status: 'not-applicable', reason: 'Agent has no workspace.' },
    runtime: { status: resumableRuntime ? 'captured-resumable-checkpoint'
      : persisted.sections.runtime || persisted.sections.runtimeCursor ? 'captured-durable-state' : 'not-applicable',
    hash: digest({ state: persisted.sections.runtime, cursor: persisted.sections.runtimeCursor }) },
    processMemory: { status: 'unsupported', reason: 'The supervised process exposes no serializable memory checkpoint.' },
    llmContext: { status: persisted.sections.modelTurns.some((turn) => turn.status === 'pending') ? 'pending-call' : 'captured-visible-context', hash: digest(persisted.sections.modelTurns) },
    providerHiddenContext: { status: 'unsupported', reason: 'The model provider exposes no hidden-context export contract.' },
    providerContinuity: continuation.length
      ? { status: 'captured-reference', hash: digest(continuation), count: continuation.length }
      : { status: 'not-applicable', reason: 'No provider continuation was captured.' },
    memoriesAndRelations: { status: 'captured', hash: persisted.hash },
    orchestrator: orchestrator.length
      ? { status: 'captured-reference', references: orchestrator }
      : { status: 'not-applicable', reason: 'No Rust biological mission is linked to this agent.' }
  };
  const consistency = 'agent-stable; workspace-capture-verified; sqlite-transaction';
  const bundle = { schemaVersion: 4, capturedAt, consistency, components };
  bundle.hash = digest({ agentId: agent.id, workspaceId: agent.workspace_id || null,
    agentState, workspaceSnapshot, persisted, orchestrator, components, capturedAt, consistency });
  return { ...agent, _genosSnapshot: { schemaVersion: 5, workspaceSnapshot,
    persistedState: persisted, orchestratorCheckpoints: orchestrator, organismSnapshot: bundle } };
}

function verifyOrganismSnapshot(state) {
  const bundle = state?._genosSnapshot?.organismSnapshot;
  if (!bundle) return { valid: true, legacy: true };
  if (![1, 2, 3, 4].includes(bundle.schemaVersion)) return { valid: false, legacy: false };
  const agentState = restorableAgentState(state);
  const workspaceSnapshot = state._genosSnapshot.workspaceSnapshot || null;
  const { hash, ...manifest } = bundle;
  const base = { agentState, workspaceSnapshot, components: manifest.components, capturedAt: manifest.capturedAt, consistency: manifest.consistency };
  const persisted = state._genosSnapshot.persistedState;
  const orchestrator = state._genosSnapshot.orchestratorCheckpoints;
  const expected = bundle.schemaVersion >= 3
    ? digest({ agentId: state.id, workspaceId: state.workspace_id || null,
      agentState, workspaceSnapshot, persisted, orchestrator, components: manifest.components,
      capturedAt: manifest.capturedAt, consistency: manifest.consistency })
    : bundle.schemaVersion === 2 ? digest({ agentState, workspaceSnapshot, persisted, components: manifest.components, capturedAt: manifest.capturedAt, consistency: manifest.consistency }) : digest(base);
  const componentsValid = bundle.schemaVersion < 2 || persistedState.verify(persisted);
  return { valid: hash === expected && componentsValid, legacy: false, hash, expected };
}

async function captureOrganismState(options) {
  const { db, scope, agent, req, snapshotId, reason, persist } = options;
  if (agent.runtime_pid || require('../../services/agentOrchestrationState').activeProcesses.has(agent.id)) {
    throw Object.assign(new Error('Stop the agent runtime before capturing a consistent organism snapshot.'), { code: 'ORGANISM_SNAPSHOT_RUNTIME_ACTIVE', status: 409 });
  }
  const missions = await orchestratorCheckpoint.linkedMissions(db, agent.id);
  return orchestratorCheckpoint.withMissionLocks(missions, async () => {
    const beforeHash = digest(restorableAgentState(agent));
    const workspaceSnapshot = await captureAgentWorkspace({ db, scope, agent, req, snapshotId, reason });
    return withTransaction(db, async () => {
      const latestAgent = await loadAgentForScope(db, scope, agent.id);
      if (!latestAgent || digest(restorableAgentState(latestAgent)) !== beforeHash) {
        throw Object.assign(new Error('Agent state changed during organism snapshot capture; capture aborted.'), { code: 'ORGANISM_SNAPSHOT_BARRIER_CHANGED', status: 409 });
      }
      const currentMissions = await orchestratorCheckpoint.linkedMissions(db, agent.id);
      if (JSON.stringify(currentMissions) !== JSON.stringify(missions)) {
        throw Object.assign(new Error('Agent mission mapping changed during capture.'), { code: 'ORGANISM_SNAPSHOT_MISSION_CHANGED', status: 409 });
      }
      const persisted = await persistedState.capture(db, agent.id, scope);
      runtimeCheckpoint.captured(persisted.sections.runtime);
      if (persisted.sections.modelTurns.some((turn) => turn.status === 'pending')) {
        throw Object.assign(new Error('Model inference is in progress; organism snapshot capture aborted.'), { code: 'ORGANISM_SNAPSHOT_MODEL_PENDING', status: 409 });
      }
      const orchestrator = await orchestratorCheckpoint.capture(db, agent.id, { locked: true, scope });
      const state = encodeAgentSnapshot(latestAgent, workspaceSnapshot,
        { capturedAt: new Date().toISOString(), persisted, orchestrator });
      await persist(state);
      return state;
    });
  });
}

async function restoreSnapshotWorkspace(options) {
  const { db, scope, agent, state } = options;
  const reference = state._genosSnapshot?.workspaceSnapshot;
  if (!reference) return null;
  if (!agent.workspace_id || reference.workspaceId !== agent.workspace_id || !reference.id) {
    throw Object.assign(new Error('The workspace snapshot does not belong to the current agent workspace.'), { code: 'AGENT_WORKSPACE_SNAPSHOT_MISMATCH' });
  }
  const workspace = await loadScopedWorkspace(db, scope, reference.workspaceId);
  if (!workspace?.path) {
    throw Object.assign(new Error('The agent workspace is unavailable for state restore.'), { code: 'AGENT_WORKSPACE_RESTORE_UNAVAILABLE' });
  }
  return workspaceSnapshots.restore({ db, workspace, reference: reference.id, author: 'agent-state-restore' });
}

async function restoreAgentStateSnapshot(options) {
  const { db, scope, agent, state } = options;
  const references = await verifyRestoreTarget({ agent, state });
  return orchestratorCheckpoint.withMissionLocks(references || [], async () => {
    if (references?.length && !await orchestratorCheckpoint.verify(references)) throw new Error('Rust mission checkpoint changed during restore.');
    await orchestratorCheckpoint.assertCoherent(db, { agentId: agent.id, references: references || [], scope });
    return restoreLockedSnapshot({ db, scope, agent, state, references: references || [] });
  });
}

async function restoreLockedSnapshot(options) {
  const { db, scope, agent, state, references } = options;
  const resumableRuntime = runtimeCheckpoint.resumable(state._genosSnapshot?.persistedState?.sections?.runtime);
  const current = references.length ? await orchestratorCheckpoint.capture(db, agent.id, { locked: true, scope }) : [];
  const flags = await orchestratorCheckpoint.active(references);
  const previous = current.map((reference, index) => ({ ...reference, rewound: flags[index].rewound }));
  const workspaceRestore = await restoreSnapshotWorkspace({ db, scope, agent, state });
  let safetySnapshotId = null;
  try {
    await orchestratorCheckpoint.select(references);
    safetySnapshotId = await withTransaction(db, async () => {
      await orchestratorCheckpoint.assertCoherent(db, { agentId: agent.id, references, scope });
      return applyPersistedRestore({ db, scope, agent, state,
        workspaceSnapshot: workspaceRestore?.safetySnapshot || null, previous });
    });
  } catch (error) {
    await orchestratorCheckpoint.select(previous).catch((rollbackError) => {
      error.message += ` Rust cursor rollback also failed: ${rollbackError.message}`;
    });
    await rollbackWorkspaceAfterFailure({ db, scope, agent, workspaceRestore, error });
    throw error;
  }
  return { workspaceRestored: Boolean(workspaceRestore), workspaceSnapshotId: state._genosSnapshot?.workspaceSnapshot?.id || null,
    runtimeRestartRequired: restartRequired(state, resumableRuntime),
    runtimeResumeAvailable: Boolean(resumableRuntime),
    runtimeCheckpointId: resumableRuntime ? state._genosSnapshot.persistedState.sections.runtime.id : null,
    runtimeReplayCursorId: state._genosSnapshot?.persistedState?.sections?.runtimeCursor?.id || null,
    orchestratorResumeRequired: false, orchestratorCursorRestored: references.length > 0,
    processMemoryRestored: false, providerHiddenContextRestored: false,
    providerContinuityRestored: false,
    providerContinuationAvailable: providerContinuity.available(state._genosSnapshot?.persistedState?.sections?.modelTurns || []),
    safetySnapshotId };
}

function restartRequired(state, resumableRuntime) {
  return Boolean(resumableRuntime) || state._genosSnapshot?.schemaVersion >= 3 && state.status === 'running';
}

async function verifyRestoreTarget(options) {
  const { agent, state } = options;
  if (agent.runtime_pid || require('../../services/agentOrchestrationState').activeProcesses.has(agent.id)) {
    throw Object.assign(new Error('Stop the agent runtime before restoring an organism snapshot.'), { code: 'ORGANISM_RESTORE_RUNTIME_ACTIVE', status: 409 });
  }
  if (state.id !== agent.id || state.workspace_id !== agent.workspace_id) {
    throw Object.assign(new Error('Snapshot agent or workspace identity mismatch.'), { code: 'ORGANISM_SNAPSHOT_OWNER_MISMATCH', status: 403 });
  }
  const integrity = verifyOrganismSnapshot(state);
  if (!integrity.valid) {
    throw Object.assign(new Error('Organism snapshot manifest hash does not match its captured components.'), { code: 'ORGANISM_SNAPSHOT_INTEGRITY_FAILED', status: 409 });
  }
  runtimeCheckpoint.captured(state._genosSnapshot?.persistedState?.sections?.runtime);
  const references = state._genosSnapshot?.orchestratorCheckpoints;
  if (references && !await orchestratorCheckpoint.verify(references)) {
    throw Object.assign(new Error('Rust mission checkpoint reference is missing or corrupt.'), { code: 'ORGANISM_ORCHESTRATOR_CHECKPOINT_INVALID', status: 409 });
  }
  return references;
}

async function applyPersistedRestore(options) {
  const { db, scope, agent, state, workspaceSnapshot, previous } = options;
  const safetySnapshotId = await persistPreRestoreSafety({ db, scope, agent, workspaceSnapshot, previous });
  const requiresRestart = Boolean(runtimeCheckpoint.resumable(state._genosSnapshot?.persistedState?.sections?.runtime))
    || state._genosSnapshot?.schemaVersion >= 3 && state.status === 'running';
  await applySnapshotState(db, requiresRestart ? { ...state, status: 'blocked' } : state, agent.id);
  if (state._genosSnapshot?.persistedState) {
    await persistedState.restore(db, agent.id, { payload: state._genosSnapshot.persistedState, scope });
  }
  return safetySnapshotId;
}

async function rollbackWorkspaceAfterFailure(options) {
  const { db, scope, agent, workspaceRestore, error } = options;
  const safetySnapshotId = workspaceRestore?.safetySnapshot?.id;
  if (!safetySnapshotId) return;
  const workspace = await loadScopedWorkspace(db, scope, agent.workspace_id);
  await workspaceSnapshots.restore({ db, workspace, reference: safetySnapshotId,
    author: 'agent-state-rollback' }).catch((rollbackError) => {
    error.message += ` Workspace rollback also failed: ${rollbackError.message}`;
  });
}

async function persistPreRestoreSafety(options) {
  const { db, scope, agent, workspaceSnapshot, previous } = options;
  const current = await loadAgentForScope(db, scope, agent.id);
  if (!current) throw new Error('Agent disappeared before restore.');
  const persisted = await persistedState.capture(db, agent.id, scope);
  const orchestrator = previous.length ? previous : await orchestratorCheckpoint.capture(db, agent.id, { locked: true, scope });
  const reference = workspaceSnapshot ? { id: workspaceSnapshot.id,
    hash: workspaceSnapshot.snapshotHash, workspaceId: agent.workspace_id } : null;
  const state = encodeAgentSnapshot(current, reference,
    { capturedAt: new Date().toISOString(), persisted, orchestrator });
  const id = newAgentSnapshotId('agent-safety');
  await db.run('INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    id, agent.id, agent.workspace_id, JSON.stringify(state), 'Pre-restore safety snapshot', 'agent-state-restore');
  return id;
}

async function applySnapshotState(db, state, agentId) {
  await db.run(
    `UPDATE agents SET name = ?, name_meaning = ?, role = ?, model_tier = ?, language = ?, isolation_mode = ?,
      dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?,
      is_apoptotic = ?, status = ?, current_task = ?, runtime_pid = NULL, runtime_started_at = NULL,
      runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    state.name, state.name_meaning, state.role, state.model_tier, state.language, state.isolation_mode,
    orDefault(state.dissonance_level, 0), orDefault(state.eureka_count, 0), nullish(state.cognitive_budget, 0), nullish(state.cognitive_baseline_budget, 0),
    nullish(state.cognitive_max_dissonance, 50), orDefault(state.is_apoptotic, 0), state.status, state.current_task, agentId
  );
}

async function snapshotAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  if (!agentId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  if (!agent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent is not available in the current tenant.' } });
  const snapshotId = newAgentSnapshotId();
  const reason = req.body?.reason || 'Agent state snapshot';
  const state = await captureOrganismState({ db, scope, agent, req, snapshotId, reason,
    persist: (captured) => db.run('INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)', snapshotId, agent.id, agent.workspace_id, JSON.stringify(captured), reason, actorName(req)) });
  const workspaceSnapshot = state._genosSnapshot.workspaceSnapshot;
  return res.status(201).json({ success: true, snapshotId, workspaceSnapshotId: workspaceSnapshot?.id || null, workspaceSnapshotHash: workspaceSnapshot?.hash || null, organismSnapshot: state._genosSnapshot.organismSnapshot, agentId: agent.id, createdAt: new Date().toISOString() });
}

async function commitAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const message = readString(req.body, 'message');
  const refName = readString(req.body, 'refName', 'main');
  if (!agentId || !message) return res.status(400).json({ error: { code: 'AGENT_COMMIT_REQUIRED', message: 'agentId and message are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  if (!agent) return res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: 'Agent is not available in the current tenant.' } });
  const parent = await db.get('SELECT id FROM agent_state_snapshots WHERE agent_id = ? AND ref_name = ? ORDER BY created_at DESC, id DESC LIMIT 1', agentId, refName);
  const commitId = newAgentSnapshotId('agent-commit');
  const state = await captureOrganismState({ db, scope, agent, req, snapshotId: commitId, reason: 'Agent commit',
    persist: (captured) => db.run(
      'INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, commit_message, parent_snapshot_id, ref_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      commitId, agent.id, agent.workspace_id, JSON.stringify(captured), 'Agent commit', message, optionalId(parent), refName, actorName(req)) });
  const workspaceSnapshot = state._genosSnapshot.workspaceSnapshot;
  return res.status(201).json({ success: true, commitId, parentCommitId: optionalId(parent), workspaceSnapshotId: workspaceSnapshot?.id || null, organismSnapshot: state._genosSnapshot.organismSnapshot, agentId, refName, message });
}

async function branchAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const refName = readString(req.body, 'refName');
  const fromCommitId = readString(req.body, 'fromCommitId');
  if (!agentId || !refName) return res.status(400).json({ error: { code: 'AGENT_BRANCH_REQUIRED', message: 'agentId and refName are required.' } });
  if (!/^[A-Za-z0-9._-]+$/.test(refName)) return res.status(400).json({ error: { code: 'AGENT_BRANCH_INVALID', message: 'refName contains unsupported characters.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const source = fromCommitId
    ? await db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', fromCommitId, agentId)
    : await db.get("SELECT * FROM agent_state_snapshots WHERE agent_id = ? AND ref_name = 'main' ORDER BY created_at DESC, id DESC LIMIT 1", agentId);
  if (!agent || !source) return res.status(404).json({ error: { code: 'AGENT_COMMIT_NOT_FOUND', message: 'Agent or source commit is not available.' } });
  const branchId = `agent-branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.run(
    'INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, commit_message, parent_snapshot_id, ref_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    branchId, agentId, agent.workspace_id, source.state_json, 'Agent branch', `Branch ${refName} from ${source.id}`, source.id, refName, actorName(req)
  );
  return res.status(201).json({ success: true, branchId, agentId, refName, fromCommitId: source.id });
}

async function loadCheckoutSnapshot(db, context) {
  return context.snapshotId
    ? db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', context.snapshotId, context.agentId)
    : db.get('SELECT * FROM agent_state_snapshots WHERE agent_id = ? AND ref_name = ? ORDER BY created_at DESC, id DESC LIMIT 1', context.agentId, context.refName);
}

async function checkoutAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const snapshotId = readString(req.body, 'snapshotId');
  const refName = readString(req.body, 'refName');
  if (!agentId || (!snapshotId && !refName)) return res.status(400).json({ error: { code: 'AGENT_CHECKOUT_REQUIRED', message: 'agentId and snapshotId or refName are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const snapshot = await loadCheckoutSnapshot(db, { agentId, snapshotId, refName });
  if (!agent || !snapshot) return res.status(404).json({ error: { code: 'AGENT_CHECKOUT_NOT_FOUND', message: 'Agent or target commit/ref is not available.' } });
  const state = JSON.parse(snapshot.state_json);
  const restored = await restoreAgentStateSnapshot({ db, scope, agent, state });
  return res.json({ success: true, agentId, snapshotId: snapshot.id, refName: snapshot.ref_name || refName || 'main', reset: req.body?.reset === true, ...restored });
}

async function restoreAgentState(req, res) {
  const agentId = readString(req.body, 'agentId');
  const snapshotId = readString(req.body, 'snapshotId');
  if (!agentId || !snapshotId) return res.status(400).json({ error: { code: 'AGENT_SNAPSHOT_REQUIRED', message: 'agentId and snapshotId are required.' } });
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const agent = await loadAgentForScope(db, scope, agentId);
  const snapshot = await db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ?', snapshotId, agentId);
  if (!agent || !snapshot) return res.status(404).json({ error: { code: 'AGENT_SNAPSHOT_NOT_FOUND', message: 'Agent or state snapshot is not available.' } });
  const state = JSON.parse(snapshot.state_json);
  const restored = await restoreAgentStateSnapshot({ db, scope, agent, state });
  return res.json({ success: true, agentId, snapshotId, restored: true, ...restored });
}

module.exports = {
  applySnapshotState,
  verifyOrganismSnapshot,
  restoreAgentStateSnapshot,
  snapshotAgentState,
  commitAgentState,
  branchAgentState,
  checkoutAgentState,
  restoreAgentState
};
