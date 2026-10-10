const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const dbModule = require('../src/db');

const agent = {
  id: 'agent-1', workspace_id: 'workspace-1', name: 'Agent', name_meaning: 'state test',
  role: 'Solver', model_tier: 'standard', language: 'fr', isolation_mode: null,
  dissonance_level: 0, eureka_count: 0, cognitive_budget: 80,
  cognitive_baseline_budget: 0, cognitive_max_dissonance: 50, is_apoptotic: 0,
  status: 'running', current_task: 'initial task', genome_id: 'genome-1',
  organization_id: 'org-1', project_id: 'project-1'
};

async function getRecord(options) {
  const { sql, args, state, workspace } = options;
  if (sql.includes('SELECT w.id, w.name, w.path')) return args[0] === workspace.id ? workspace : null;
  if (sql.includes('SELECT a.* FROM agents')) return { ...state.agent };
  if (sql.includes('SELECT s.*, w.path AS workspace_path')) return findWorkspaceSnapshot(state, workspace, args);
  if (sql.includes('SELECT step_number FROM workspace_snapshots')) return findSnapshotStep(state, args[0]);
  if (sql.includes('SELECT 1 FROM workspace_snapshots')) return hasSnapshotHash(state, args[0]);
  if (sql.includes('agent_state_snapshots')) return state.agentSnapshots.find((row) => row.id === args[0]) || null;
  return null;
}

function findWorkspaceSnapshot(state, workspace, args) {
  const row = state.snapshots.find((item) => item.workspace_id === args[0] && (item.id === args[1] || item.snapshot_hash === args[2]));
  return row ? { ...row, workspace_path: workspace.path } : null;
}

function findSnapshotStep(state, id) {
  const row = state.snapshots.find((item) => item.id === id);
  return row ? { step_number: row.step_number } : null;
}

function hasSnapshotHash(state, hash) {
  return state.snapshots.some((row) => row.snapshot_hash === hash) ? { 1: 1 } : null;
}

async function saveRecord(options) {
  const { sql, args, state } = options;
  if (sql.includes('INSERT INTO workspace_snapshots')) return saveWorkspaceSnapshot(state, args);
  if (sql.includes('INSERT INTO agent_state_snapshots')) return saveAgentSnapshot(state, args);
  if (sql.includes('UPDATE agents SET')) return updateAgentState(state, args);
}

function saveWorkspaceSnapshot(state, args) {
  const [id, workspaceId, hash, label, author, reason, diffSummary, metadata] = args;
  const step = state.snapshots.filter((row) => row.workspace_id === workspaceId).length + 1;
  state.snapshots.push({ id, workspace_id: workspaceId, snapshot_hash: hash, step_number: step, label, author, reason, diff_summary: diffSummary, metadata });
}

function saveAgentSnapshot(state, args) {
  state.agentSnapshots.push({ id: args[0], state_json: args[3] });
}

function updateAgentState(state, args) {
  const fields = ['name', 'name_meaning', 'role', 'model_tier', 'language', 'isolation_mode', 'dissonance_level', 'eureka_count', 'cognitive_budget', 'cognitive_baseline_budget', 'cognitive_max_dissonance', 'is_apoptotic', 'status', 'current_task'];
  fields.forEach((field, index) => { state.agent[field] = args[index]; });
}

function createDatabase(workspacePath) {
  const state = { agent: { ...agent }, snapshots: [], agentSnapshots: [] };
  const workspace = { id: agent.workspace_id, name: 'workspace', path: workspacePath };
  return { state, db: {
    all: async (sql, ...args) => sql.includes('SELECT snapshot_hash') ? state.snapshots.filter((row) => row.workspace_id === args[0]) : [],
    get: async (sql, ...args) => getRecord({ sql, args, state, workspace }),
    run: async (sql, ...args) => saveRecord({ sql, args, state })
  } };
}

function response() {
  let result;
  return {
    res: { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } },
    get: () => result
  };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-agent-state-'));
  const filePath = path.join(root, 'source.txt');
  const originalGetDatabase = dbModule.getDatabase;
  try {
    await fs.writeFile(filePath, 'snapshot source');
    const fixture = createDatabase(root);
    dbModule.getDatabase = async () => fixture.db;
    delete require.cache[require.resolve('../src/controllers/lineageController')];
    const controller = require('../src/controllers/lineageController');
    const request = { body: { agentId: agent.id, reason: 'contract' }, tenant: { organizationId: agent.organization_id, projectId: agent.project_id } };
    const saved = response();
    await controller.snapshotAgentState(request, saved.res);
    assert.equal(saved.get().code, 201);
    assert.ok(saved.get().body.workspaceSnapshotId);
    const capturedState = JSON.parse(fixture.state.agentSnapshots[0].state_json);
    const integrity = require('../src/controllers/lineage/snapshots').verifyOrganismSnapshot;
    assert.equal(integrity(capturedState).valid, true);
    assert.equal(capturedState._genosSnapshot.organismSnapshot.components.runtime.status, 'not-applicable');
    assert.equal(capturedState._genosSnapshot.persistedState.schemaVersion, 3);
    capturedState._genosSnapshot.organismSnapshot.components.agentState.hash = 'tampered';
    assert.equal(integrity(capturedState).valid, false);

    fixture.state.agent.status = 'completed';
    fixture.state.agent.cognitive_budget = 3;
    fixture.state.agent.current_task = 'mutated task';
    await fs.writeFile(filePath, 'mutated source');
    const restored = response();
    await controller.restoreAgentState({ ...request, body: { agentId: agent.id, snapshotId: saved.get().body.snapshotId } }, restored.res);

    assert.equal(restored.get().body.restored, true);
    assert.equal(restored.get().body.workspaceRestored, true);
    assert.equal(fixture.state.agent.status, 'blocked');
    assert.equal(restored.get().body.runtimeRestartRequired, true);
    assert.equal(fixture.state.agent.cognitive_budget, 80);
    assert.equal(fixture.state.agent.current_task, 'initial task');
    assert.equal(await fs.readFile(filePath, 'utf8'), 'snapshot source');
    console.log('Agent state and workspace restore contract passed.');
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    delete require.cache[require.resolve('../src/controllers/lineageController')];
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
