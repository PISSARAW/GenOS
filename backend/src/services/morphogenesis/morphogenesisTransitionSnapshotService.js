'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../../db');
const collective = require('../collectiveStateService');
const workspaceSnapshots = require('../workspaceSnapshotStore');
const orchestration = require('../agentOrchestrationState');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');
const { migrateMorphogenesisTransitionSnapshots } = require('../../db/migrations/migrateMorphogenesisTransitionSnapshots');

const AGENT_FIELDS = [
  'id', 'workspace_id', 'status', 'current_task', 'runtime_pid', 'runtime_started_at',
  'runtime_executable', 'cognitive_budget', 'cognitive_baseline_budget',
  'cognitive_max_dissonance', 'dissonance_level', 'eureka_count', 'is_apoptotic'
];

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function scope(input) {
  const value = {
    organizationId: input.req?.tenant?.organizationId,
    projectId: input.req?.tenant?.projectId,
    principalId: input.req?.user?.keyId || input.req?.user?.username,
    missionId: input.missionId || input.plan?.missionId || input.agentId
  };
  if (Object.values(value).some((item) => typeof item !== 'string' || !item.trim())) {
    throw coded('MORPHOGENESIS_SNAPSHOT_SCOPE_REQUIRED',
      'Authenticated principal, tenant and mission scope are required.');
  }
  return value;
}

function affectedAgentIds(input) {
  const ids = new Set([input.agentId]);
  for (const action of input.plan.actions || []) {
    if (action.agentId) ids.add(action.agentId);
    if (action.parentAgentId) ids.add(action.parentAgentId);
  }
  for (const id of input.collectiveState.agents.keys()) ids.add(id);
  return [...ids].filter(Boolean).sort();
}

async function rowsForIds(db, table, ids) {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  return db.all(`SELECT * FROM ${table} WHERE agent_id IN (${marks}) ORDER BY agent_id`, ...ids)
    .catch(() => []);
}

async function agentRows(db, ids, tenant) {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  return db.all(`SELECT ${AGENT_FIELDS.map((field) => `a.${field}`).join(',')}
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id IN (${marks}) AND w.organization_id = ? AND w.project_id = ? ORDER BY a.id`,
  ...ids, tenant.organizationId, tenant.projectId);
}

function assertQuiescent(ids, agents) {
  const memoryActive = ids.find((id) => orchestration.activeProcesses.has(id)
    || orchestration.missionStarts.has(id));
  const databaseActive = agents.find((agent) => agent.runtime_pid != null || agent.status === 'running');
  if (memoryActive || databaseActive) {
    throw coded('MORPHOGENESIS_SNAPSHOT_NOT_QUIESCENT',
      `Transition capture requires quiescence (${memoryActive || databaseActive.id}).`);
  }
}

async function captureWorkspaces(input, agents) {
  const store = input.snapshotStore || workspaceSnapshots;
  const ids = [...new Set(agents.map((agent) => agent.workspace_id).filter(Boolean))];
  const captured = [];
  for (const id of ids) {
    const workspace = await input.db.get('SELECT id, name, path FROM workspaces WHERE id = ?', id);
    if (!workspace?.path) throw coded('MORPHOGENESIS_WORKSPACE_UNAVAILABLE', `Workspace ${id} is unavailable.`);
    const snap = await store.capture({ db: input.db, workspace,
      label: `Morphogenesis ${input.transitionId}`, reason: 'Pre-transition durable snapshot',
      author: input.tenant.principalId, agentId: input.agentId, state: { status: 'quiescent' } });
    captured.push({ workspace, snapshotId: snap.id, snapshotHash: snap.snapshotHash });
  }
  return captured;
}

async function capture(input) {
  await migrateMorphogenesisTransitionSnapshots(input.db);
  const tenant = scope(input);
  const ids = affectedAgentIds(input);
  const agents = await agentRows(input.db, ids, tenant);
  if (!agents.some((agent) => agent.id === input.agentId)) {
    throw coded('MORPHOGENESIS_AGENT_SCOPE_MISMATCH', 'Transition agent is outside the authenticated tenant.');
  }
  assertQuiescent(ids, agents);
  const workspaces = await captureWorkspaces({ ...input, tenant }, agents);
  const payload = {
    schemaVersion: 1, capturedAt: new Date().toISOString(), transitionId: input.transitionId,
    tenant, agentIds: agents.map((agent) => agent.id), processes: { quiescent: true,
      runtimeCheckpoints: await rowsForIds(input.db, 'agent_runtime_state', ids) },
    agents, workspaces, leases: {
      refs: await rowsForIds(input.db, 'agent_git_refs', ids),
      identities: await rowsForIds(input.db, 'agent_identity_heads', ids)
    },
    budgets: Object.fromEntries(agents.map((agent) => [agent.id, {
      cognitive: agent.cognitive_budget, baseline: agent.cognitive_baseline_budget,
      maximumDissonance: agent.cognitive_max_dissonance
    }])),
    collectiveState: collective.serializeState(input.collectiveState)
  };
  const planHash = digest(input.plan);
  const hash = digest(payload);
  const id = `mts-${crypto.randomUUID()}`;
  await input.db.run(`INSERT INTO morphogenesis_transition_snapshots
    (snapshot_id, transition_id, organization_id, project_id, mission_id, principal_id,
     plan_hash, snapshot_hash, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared')`,
  id, input.transitionId, tenant.organizationId, tenant.projectId, tenant.missionId,
  tenant.principalId, planHash, hash, JSON.stringify(payload));
  return Object.freeze({ id, hash, planHash, transitionId: input.transitionId, status: 'prepared' });
}

async function load(input) {
  const row = await input.db.get('SELECT * FROM morphogenesis_transition_snapshots WHERE snapshot_id = ?', input.id);
  if (!row) throw coded('MORPHOGENESIS_SNAPSHOT_NOT_FOUND', 'Transition snapshot was not found.');
  const payload = JSON.parse(row.payload_json);
  if (digest(payload) !== row.snapshot_hash) {
    throw coded('MORPHOGENESIS_SNAPSHOT_INTEGRITY_FAILED', 'Transition snapshot hash is invalid.');
  }
  return { row, payload };
}

async function markApplying(input) {
  const authority = JSON.stringify(input.authority);
  const result = await input.db.run(`UPDATE morphogenesis_transition_snapshots
    SET status='applying', authority_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE snapshot_id=? AND status='prepared'`, authority, input.id);
  if (result.changes !== 1) throw coded('MORPHOGENESIS_SNAPSHOT_STATE_CONFLICT', 'Snapshot is not prepared.');
}

async function appendAction(input) {
  const count = await input.db.get('SELECT COUNT(*) AS count FROM morphogenesis_transition_actions WHERE transition_id = ?', input.transitionId);
  await input.db.run(`INSERT INTO morphogenesis_transition_actions(transition_id, sequence, receipt_json)
    VALUES (?, ?, ?)`, input.transitionId, Number(count.count), JSON.stringify(input.receipt));
}

async function markCommitted(input) {
  const result = await input.db.run(`UPDATE morphogenesis_transition_snapshots
    SET status='committed', updated_at=CURRENT_TIMESTAMP WHERE snapshot_id=? AND status='applying'`, input.id);
  if (result.changes !== 1) throw coded('MORPHOGENESIS_SNAPSHOT_STATE_CONFLICT', 'Snapshot is not applying.');
}

async function persistCollective(input) {
  await input.db.exec(`CREATE TABLE IF NOT EXISTS collective_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await input.db.run(`INSERT INTO collective_state(key,value,updated_at) VALUES
    ('collective_state_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET
    value=excluded.value,updated_at=CURRENT_TIMESTAMP`, collective.serializeState(input.state));
}

async function replaceRows(db, table, rows) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const quoted = columns.map((name) => `"${name}"`).join(',');
    await db.run(`INSERT OR REPLACE INTO ${table} (${quoted}) VALUES (${columns.map(() => '?').join(',')})`,
      ...columns.map((name) => row[name]));
  }
}

async function restoreDatabase(input, payload) {
  await input.db.exec(`CREATE TABLE IF NOT EXISTS collective_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await withTransaction(input.db, async () => {
    for (const agent of payload.agents) {
      await input.db.run(`UPDATE agents SET status=?, current_task=?, runtime_pid=NULL,
        runtime_started_at=NULL, runtime_executable=NULL, cognitive_budget=?,
        cognitive_baseline_budget=?, cognitive_max_dissonance=?, dissonance_level=?,
        eureka_count=?, is_apoptotic=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      agent.status, agent.current_task, agent.cognitive_budget, agent.cognitive_baseline_budget,
      agent.cognitive_max_dissonance, agent.dissonance_level, agent.eureka_count,
      agent.is_apoptotic, agent.id);
    }
    const ids = payload.agentIds;
    if (ids.length) {
      const marks = ids.map(() => '?').join(',');
      await input.db.run(`DELETE FROM agent_runtime_state WHERE agent_id IN (${marks})`, ...ids);
      await input.db.run(`DELETE FROM agent_git_refs WHERE agent_id IN (${marks})`, ...ids);
      await input.db.run(`DELETE FROM agent_identity_heads WHERE agent_id IN (${marks})`, ...ids);
    }
    await replaceRows(input.db, 'agent_runtime_state', payload.processes.runtimeCheckpoints);
    await replaceRows(input.db, 'agent_git_refs', payload.leases.refs);
    await replaceRows(input.db, 'agent_identity_heads', payload.leases.identities);
    await input.db.run(`INSERT INTO collective_state(key,value,updated_at) VALUES
      ('collective_state_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET
      value=excluded.value,updated_at=CURRENT_TIMESTAMP`, payload.collectiveState);
  });
}

async function restore(input) {
  const loaded = await load(input);
  const changed = await input.db.run(`UPDATE morphogenesis_transition_snapshots
    SET status='restoring', error=?, updated_at=CURRENT_TIMESTAMP
    WHERE snapshot_id=? AND status IN ('applying','prepared')`, input.error || null, input.id);
  if (changed.changes !== 1) throw coded('MORPHOGENESIS_SNAPSHOT_STATE_CONFLICT', 'Snapshot cannot be restored.');
  try {
    const store = input.snapshotStore || workspaceSnapshots;
    for (const item of loaded.payload.workspaces) {
      await store.restore({ db: input.db, workspace: item.workspace,
        reference: item.snapshotId, author: 'morphogenesis-rollback' });
    }
    await restoreDatabase(input, loaded.payload);
    Object.assign(input.collectiveState, collective.deserializeState(loaded.payload.collectiveState));
    await input.db.run(`UPDATE morphogenesis_transition_snapshots SET status='restored',
      updated_at=CURRENT_TIMESTAMP WHERE snapshot_id=? AND status='restoring'`, input.id);
    return { restored: true, snapshotId: input.id, hash: loaded.row.snapshot_hash,
      domains: ['processes', 'workspaces', 'leases', 'budgets'] };
  } catch (error) {
    await input.db.run(`UPDATE morphogenesis_transition_snapshots SET status='recovery_required',
      error=?, updated_at=CURRENT_TIMESTAMP WHERE snapshot_id=?`, error.message, input.id);
    throw error;
  }
}

async function markRecoveryRequired(input) {
  await input.db.run(`UPDATE morphogenesis_transition_snapshots
    SET status='recovery_required', error=?, updated_at=CURRENT_TIMESTAMP WHERE snapshot_id=?`,
  input.error, input.id);
}

module.exports = { capture, load, markApplying, appendAction, markCommitted, restore,
  markRecoveryRequired, persistCollective, digest };
