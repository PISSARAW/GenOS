/**
 * GenOS Biology & Resilience Service
 * Adaptive apoptosis policy evaluation and hypermutation drift tracking.
 */

const {
  calculateLevenshtein,
  trackHypermutationDrift
} = require('./resilienceDrift');

const {
  somaticHypermutationPrompt,
  evaluateApoptosis
} = require('./resilienceServiceHelpers');

function snapshotState(statePayload) {
  return JSON.parse(JSON.stringify(statePayload || {}));
}

const legacyCryptobiosisSnapshots = new Map();

function isDbHandle(value) {
  return Boolean(value && typeof value.get === 'function' && typeof value.run === 'function');
}

function firstDefined(value, fallback) {
  return value === undefined ? fallback : value;
}

function normalizeFreezeArgs(args) {
  const primary = args[0];
  const second = firstDefined(args[1], 'fleet');
  const third = firstDefined(args[2], '');
  const fourth = firstDefined(args[3], {});
  if (isDbHandle(primary)) {
    return { db: primary, workspaceId: second, reason: third, statePayload: fourth };
  }
  return { db: null, workspaceId: primary || 'fleet', reason: second || '', statePayload: third || {} };
}

function freezeCryptobiosis(...args) {
  const context = normalizeFreezeArgs(args);
  if (context.db) return freezeCryptobiosisInDatabase(context);
  return freezeCryptobiosisLegacy(context);
}

function freezeCryptobiosisLegacy(context) {
  const state = snapshotState(context.statePayload || {});
  const snapshot = {
    snapshotId: `cryptobiosis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    workspaceId: context.workspaceId,
    reason: context.reason,
    frozenAt: new Date().toISOString(),
    state
  };
  legacyCryptobiosisSnapshots.set(snapshot.snapshotId, snapshot);
  while (legacyCryptobiosisSnapshots.size > 1024) {
    legacyCryptobiosisSnapshots.delete(legacyCryptobiosisSnapshots.keys().next().value);
  }
  return snapshot;
}

async function resolveFreezeWorkspace(db, workspaceId) {
  if (!workspaceId) return workspaceId;
  const workspace = await db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
  if (workspace) return workspaceId;
  return null;
}

function readFirstAgentId(agents, state) {
  const first = agents[0];
  if (first && first.id) return first.id;
  return state.agentId;
}

async function ensureAgent(db, options) {
  const existing = await db.get('SELECT id FROM agents WHERE id = ?', options.id);
  if (existing) return;
  if (options.system) {
    await db.run("INSERT OR IGNORE INTO agents(id, workspace_id, name, role, status) VALUES (?, ?, 'System Sentinel', 'System', 'idle')", options.id, options.workspaceId);
    return;
  }
  await db.run("INSERT OR IGNORE INTO agents(id, workspace_id, name, role, status) VALUES (?, ?, ?, 'System', 'idle')", options.id, options.workspaceId, options.name);
}

async function resolveFreezeAgentId(db, state, workspaceId) {
  const agents = state.agents || [];
  const agentId = readFirstAgentId(agents, state);
  if (agentId) {
    await ensureAgent(db, { id: agentId, workspaceId, name: agentId });
    return agentId;
  }
  const fallbackId = 'agent_system';
  await ensureAgent(db, { id: fallbackId, workspaceId, system: true });
  return fallbackId;
}

async function freezeCryptobiosisInDatabase(context) {
  const snapshotId = `cryptobiosis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const frozenAt = new Date().toISOString();
  const state = snapshotState(context.statePayload);
  const workspaceId = await resolveFreezeWorkspace(context.db, context.workspaceId);
  const agentId = await resolveFreezeAgentId(context.db, state, workspaceId);
  await context.db.run(
    'INSERT INTO cryptobiosis_snapshots(snapshot_id, id, agent_id, workspace_id, reason, state_json, capsule_hash, status, frozen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    snapshotId, snapshotId, agentId, workspaceId, context.reason, JSON.stringify(state), snapshotId, 'frozen', frozenAt
  );
  return {
    snapshotId,
    workspaceId,
    reason: context.reason,
    frozenAt,
    state
  };
}

function thawCryptobiosis(dbOrSnapshotId, snapshotId, targetWorkspaceId) {
  if (!dbOrSnapshotId || typeof dbOrSnapshotId.get !== 'function') {
    const legacySnapshot = legacyCryptobiosisSnapshots.get(dbOrSnapshotId);
    if (!legacySnapshot) {
      return {
        success: false,
        code: 'SNAPSHOT_NOT_FOUND',
        error: `Cryptobiosis snapshot '${dbOrSnapshotId}' is not found.`,
        snapshotId: dbOrSnapshotId
      };
    }
    return {
      success: true,
      snapshotId: dbOrSnapshotId,
      workspaceId: targetWorkspaceId || legacySnapshot.workspaceId,
      state: snapshotState(legacySnapshot.state),
      revivedAgentCount: Array.isArray(legacySnapshot.state.agents) ? legacySnapshot.state.agents.length : 0,
      restoredAt: new Date().toISOString()
    };
  }
  return thawCryptobiosisFromDatabase(dbOrSnapshotId, snapshotId, targetWorkspaceId);
}

async function thawCryptobiosisFromDatabase(db, snapshotId, targetWorkspaceId) {
  if (!db) {
    return { success: false, code: 'DB_REQUIRED', error: 'Database required', snapshotId };
  }
  const snapshot = await db.get('SELECT * FROM cryptobiosis_snapshots WHERE snapshot_id = ? OR id = ?', snapshotId, snapshotId);
  if (!snapshot) {
    return {
      success: false,
      code: 'SNAPSHOT_NOT_FOUND',
      error: `Cryptobiosis snapshot '${snapshotId}' is not found.`,
      snapshotId,
      workspaceId: targetWorkspaceId || null
    };
  }
  return {
    success: true,
    snapshotId,
    workspaceId: targetWorkspaceId || snapshot.workspace_id,
    state: snapshotState(JSON.parse(snapshot.state_json || '{}')),
    revivedAgentCount: Array.isArray(JSON.parse(snapshot.state_json || '{}').agents)
      ? JSON.parse(snapshot.state_json || '{}').agents.length
      : 0,
    restoredAt: new Date().toISOString()
  };
}

function hydrateCryptobiosis(snapshot) {
  return snapshot;
}

function normalizePersistArgs(args) {
  return {
    db: args[0],
    agentId: args[1],
    statePayload: firstDefined(args[2], {}),
    reason: firstDefined(args[3], 'runtime checkpoint')
  };
}

async function persistIntermediateState(...args) {
  return persistIntermediateStateRecord(normalizePersistArgs(args));
}

async function persistIntermediateStateRecord(context) {
  if (!context.db || typeof context.db.run !== 'function') {
    throw new Error('A database handle is required to persist intermediate runtime state.');
  }
  if (!context.agentId) {
    throw new Error('agentId is required to persist intermediate runtime state.');
  }
  const state = snapshotState(context.statePayload || {});
  const workspaceId = state.workspaceId || state.workspace_id || null;
  const status = state.status || 'intermediate';
  const currentTask = state.currentTask || state.current_task || null;
  const snapshotId = `runtime_state_${String(context.agentId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await context.db.run(
    `INSERT INTO agent_runtime_state (id, agent_id, workspace_id, status, current_task, reason, state_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(agent_id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       status = excluded.status,
       current_task = excluded.current_task,
       reason = excluded.reason,
       state_json = excluded.state_json,
       updated_at = CURRENT_TIMESTAMP`,
    snapshotId,
    context.agentId,
    workspaceId,
    status,
    currentTask,
    context.reason,
    JSON.stringify(state)
  );
  return snapshotId;
}

async function restoreIntermediateState(db, agentId) {
  if (!db || typeof db.get !== 'function') {
    throw new Error('A database handle is required to restore intermediate runtime state.');
  }
  if (!agentId) {
    throw new Error('agentId is required to restore intermediate runtime state.');
  }
  const row = await db.get('SELECT * FROM agent_runtime_state WHERE agent_id = ?', agentId);
  if (!row) return null;
  try {
    return {
      id: row.id,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      status: row.status,
      currentTask: row.current_task,
      reason: row.reason,
      ...JSON.parse(row.state_json || '{}'),
      updatedAt: row.updated_at
    };
  } catch (error) {
    throw new Error(`Unable to restore intermediate state for agent ${agentId}: ${error.message}`);
  }
}

module.exports = {
  calculateLevenshtein,
  trackHypermutationDrift,
  somaticHypermutationPrompt,
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis,
  hydrateCryptobiosis,
  persistIntermediateState,
  restoreIntermediateState
};
