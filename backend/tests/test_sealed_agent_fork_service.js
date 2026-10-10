const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { collectFiles, manifestHash } = require('../src/services/workspaceSnapshotCollect');
const { snapshotRoot } = require('../src/services/workspaceSnapshotPaths');
const { forkFromSealedSnapshot } = require('../src/services/sealedAgentForkService');
const dbModule = require('../src/db');

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function schema(db) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT, organization_id TEXT, project_id TEXT,
    visibility TEXT, language TEXT, description TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT, agent_type TEXT, execution_mode TEXT,
    workspace_id TEXT, fleet_id TEXT, cognitive_budget REAL, cognitive_baseline_budget REAL, model_tier TEXT,
    language TEXT, isolation_mode TEXT, parent_agent_id TEXT, lineage_relation TEXT, metadata_json TEXT, current_task TEXT);
    CREATE TABLE agent_state_snapshots (id TEXT PRIMARY KEY, agent_id TEXT, workspace_id TEXT, state_json TEXT);
    CREATE TABLE workspace_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT, snapshot_hash TEXT, metadata TEXT, created_at TEXT);
    CREATE TABLE lineage_nodes (id TEXT PRIMARY KEY, workspace_id TEXT, agent_id TEXT, snapshot_id TEXT,
      label TEXT, node_type TEXT, metadata TEXT);
    CREATE TABLE lineage_edges (id TEXT PRIMARY KEY, workspace_id TEXT, source_node_id TEXT,
      target_node_id TEXT, edge_type TEXT, metadata TEXT);
    CREATE TABLE episodic_memories (id TEXT PRIMARY KEY, agent_id TEXT, observation_output TEXT);
    CREATE TABLE autobiographical_episodes (id TEXT PRIMARY KEY, agent_id TEXT, situation_json TEXT);
    CREATE TABLE genome_decisions (id TEXT PRIMARY KEY, created_by TEXT, title TEXT);`);
}

function sealedState(reference) {
  const state = { id: 'source-agent', workspace_id: 'source-ws', name: 'Source', name_meaning: null,
    role: 'solver', model_tier: 'standard', language: 'fr', isolation_mode: 'Branch',
    dissonance_level: 0, eureka_count: 0, cognitive_budget: 80, cognitive_baseline_budget: 80,
    cognitive_max_dissonance: 50, is_apoptotic: 0, status: 'idle', current_task: 'source task' };
  const agentState = Object.fromEntries(['name', 'name_meaning', 'role', 'model_tier', 'language',
    'isolation_mode', 'dissonance_level', 'eureka_count', 'cognitive_budget', 'cognitive_baseline_budget',
    'cognitive_max_dissonance', 'is_apoptotic', 'status', 'current_task'].map(key => [key, state[key] ?? null]));
  const sections = {
    memories: [{ id: 'memory-1', agent_id: 'source-agent', organization_id: 'org-1', project_id: 'project-1',
      observation_output: 'parent observation' }],
    autobiographicalEpisodes: [{ id: 'episode-1', agent_id: 'source-agent', organization_id: 'org-1',
      project_id: 'project-1', situation_json: '{"goal":"source"}' }],
    decisions: [{ id: 'decision-1', created_by: 'source-agent', organization_id: 'org-1', project_id: 'project-1',
      title: 'parent decision' }], modelTurns: []
  };
  const persisted = { schemaVersion: 3, sections, hash: hash(sections) };
  const capturedAt = '2026-10-10T00:00:00.000Z';
  const consistency = 'agent-stable; workspace-capture-verified; sqlite-transaction';
  const components = {};
  const organism = { schemaVersion: 4, capturedAt, consistency, components,
    hash: hash({ agentId: state.id, workspaceId: state.workspace_id, agentState,
      workspaceSnapshot: reference, persisted, orchestrator: [], components, capturedAt, consistency }) };
  state._genosSnapshot = { workspaceSnapshot: reference, persistedState: persisted,
    orchestratorCheckpoints: [], organismSnapshot: organism };
  return state;
}

function resealState(state) {
  const manifest = state._genosSnapshot.organismSnapshot;
  const persisted = state._genosSnapshot.persistedState;
  persisted.hash = hash(persisted.sections);
  const agentState = Object.fromEntries(['name', 'name_meaning', 'role', 'model_tier', 'language',
    'isolation_mode', 'dissonance_level', 'eureka_count', 'cognitive_budget', 'cognitive_baseline_budget',
    'cognitive_max_dissonance', 'is_apoptotic', 'status', 'current_task'].map(key => [key, state[key] ?? null]));
  manifest.hash = hash({ agentId: state.id, workspaceId: state.workspace_id, agentState,
    workspaceSnapshot: state._genosSnapshot.workspaceSnapshot, persisted,
    orchestrator: state._genosSnapshot.orchestratorCheckpoints, components: manifest.components,
    capturedAt: manifest.capturedAt, consistency: manifest.consistency });
  return state;
}

async function fixture(root) {
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'proof.txt'), 'sealed source');
  const files = await collectFiles(source);
  const workspaceHash = manifestHash(files);
  const storage = path.join(snapshotRoot(source, 'source-ws'), workspaceHash);
  await fs.mkdir(path.join(storage, 'files'), { recursive: true });
  await fs.copyFile(path.join(source, 'proof.txt'), path.join(storage, 'files', 'proof.txt'));
  const manifestPath = path.join(storage, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, hash: workspaceHash, files }));
  const metadata = JSON.stringify({ manifestPath, snapshotContext: { snapshot_id: 'workspace-snapshot', agent_id: 'source-agent' } });
  const reference = { id: 'workspace-snapshot', hash: workspaceHash, workspaceId: 'source-ws' };
  const state = sealedState(reference);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await schema(db);
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'source-ws', 'Source', source, 'org-1', 'project-1');
  await db.run(`INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id,
    cognitive_budget, model_tier, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'source-agent', 'Source', 'solver', 'idle', 'GenOS', 'orchestrator', 'source-ws', 80, 'standard', 'fr');
  await db.run('INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, metadata) VALUES (?, ?, ?, ?)',
    'workspace-snapshot', 'source-ws', workspaceHash, metadata);
  await db.run('INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json) VALUES (?, ?, ?, ?)',
    'agent-snapshot', 'source-agent', 'source-ws', JSON.stringify(state));
  await db.run('INSERT INTO episodic_memories (id, agent_id, observation_output) VALUES (?, ?, ?)',
    'memory-1', 'source-agent', 'parent observation');
  await db.run('INSERT INTO autobiographical_episodes (id, agent_id, situation_json) VALUES (?, ?, ?)',
    'episode-1', 'source-agent', '{"goal":"source"}');
  await db.run('INSERT INTO genome_decisions (id, created_by, title) VALUES (?, ?, ?)',
    'decision-1', 'source-agent', 'parent decision');
  return { db, source, state };
}

async function assertRejected(input, code) {
  await assert.rejects(() => forkFromSealedSnapshot(input), error => error.code === code);
}

async function testMcpEntry(input) {
  const names = ['GENOS_MCP_ALLOW_AGENT_FORK', 'GENOS_MCP_ORGANIZATION_ID', 'GENOS_MCP_PROJECT_ID',
    'GENOS_MCP_AGENT_ID', 'GENOS_MCP_FORK_ROOT', 'GENOS_MCP_LEASE'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalGetDatabase = dbModule.getDatabase;
  const handlerPath = require.resolve('../src/services/mcpBioTools/handlers/agentForkSnapshot');
  try {
    process.env.GENOS_MCP_ALLOW_AGENT_FORK = 'true';
    process.env.GENOS_MCP_ORGANIZATION_ID = 'org-1';
    process.env.GENOS_MCP_PROJECT_ID = 'project-1';
    process.env.GENOS_MCP_AGENT_ID = 'source-agent';
    process.env.GENOS_MCP_FORK_ROOT = input.forkRoot;
    process.env.GENOS_MCP_LEASE = 'genos_agent_fork_snapshot';
    dbModule.getDatabase = async () => input.db;
    delete require.cache[handlerPath];
    const { handleAgentForkSnapshot, handleAgentForkSnapshotError } = require(handlerPath);
    assert.equal(handleAgentForkSnapshotError(new Error('private server path')).error, 'Fork operation failed.');
    const denied = await handleAgentForkSnapshot({ agent_id: 'other-agent', snapshot_id: input.snapshotId,
      idempotency_key: 'mcp-request', budget: 5 });
    assert.equal(denied.code, 'MCP_AGENT_ID_MISMATCH');
    const created = await handleAgentForkSnapshot({ agent_id: input.agentId, snapshot_id: input.snapshotId,
      idempotency_key: 'mcp-request', budget: 5 });
    assert.equal(created.status, 'snapshot_fork_created');
    assert.equal(created.runtimeStarted, false);
    const routed = await require('../src/services/mcpToolRegistry').dispatchTool('genos_agent_fork_snapshot', {
      agent_id: input.agentId, snapshot_id: input.snapshotId, idempotency_key: 'mcp-request', budget: 5 });
    assert.equal(routed.kind, 'bio');
    assert.equal(routed.result.reused, true);
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    delete require.cache[handlerPath];
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-sealed-fork-'));
  let db;
  try {
    const saved = await fixture(root);
    db = saved.db;
    const input = { db, tenant: { organizationId: 'org-1', projectId: 'project-1' }, agentId: 'source-agent',
      snapshotId: 'agent-snapshot', idempotencyKey: 'request-1', budget: 30, forkRoot: path.join(root, 'forks') };
    await assertRejected({ ...input, tenant: { organizationId: 'org-2', projectId: 'project-1' } }, 'FORK_SOURCE_NOT_FOUND');
    await assertRejected({ ...input, forkRoot: path.join(root, 'source', 'forks') }, 'FORK_ROOT_OVERLAP');
    const result = await forkFromSealedSnapshot(input);
    assert.equal(result.status, 'snapshot_fork_created');
    assert.equal(result.runtimeStarted, false);
    assert.equal(result.memoryCloned, false);
    assert.equal(result.inheritedArchiveAvailable, true);
    assert.deepEqual(result.inheritedArchiveCounts, { memories: 1, autobiographicalEpisodes: 1, decisions: 1 });
    assert.equal(await fs.readFile(path.join(root, 'forks', result.childWorkspaceId, 'proof.txt'), 'utf8'), 'sealed source');
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'source-agent')).cognitive_budget, 50);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM lineage_edges')).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM episodic_memories WHERE agent_id = ?', result.childAgentId)).n, 0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM autobiographical_episodes WHERE agent_id = ?', result.childAgentId)).n, 0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM genome_decisions WHERE created_by = ?', result.childAgentId)).n, 0);
    const retry = await forkFromSealedSnapshot(input);
    assert.equal(retry.reused, true);
    assert.equal(retry.childAgentId, result.childAgentId);
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'source-agent')).cognitive_budget, 50);
    await fs.writeFile(path.join(root, 'forks', result.childWorkspaceId, 'proof.txt'), 'legitimate child change');
    assert.equal((await forkFromSealedSnapshot(input)).reused, true);
    await assertRejected({ ...input, budget: 31 }, 'FORK_IDEMPOTENCY_CONFLICT');
    const interrupted = { ...input, idempotencyKey: 'request-2', budget: 10 };
    const originalRun = db.run.bind(db);
    db.run = async (sql, ...args) => {
      if (sql.includes('INSERT INTO agents')) throw new Error('injected transaction failure');
      return originalRun(sql, ...args);
    };
    await assert.rejects(() => forkFromSealedSnapshot(interrupted), /injected transaction failure/);
    db.run = originalRun;
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'source-agent')).cognitive_budget, 50);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM agents')).n, 2);
    const forkNames = await fs.readdir(path.join(root, 'forks'));
    const orphanName = forkNames.find(name => name !== result.childWorkspaceId);
    const orphanFile = path.join(root, 'forks', orphanName, 'proof.txt');
    await fs.writeFile(orphanFile, 'tampered orphan');
    await assert.rejects(() => forkFromSealedSnapshot(interrupted), /Fork destination differs/);
    await fs.writeFile(orphanFile, 'sealed source');
    const recovered = await forkFromSealedSnapshot(interrupted);
    assert.equal(recovered.reused, false);
    assert.equal((await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', 'source-agent')).cognitive_budget, 40);
    await testMcpEntry(input);
    await db.run('UPDATE agent_state_snapshots SET state_json = ? WHERE id = ?', JSON.stringify({ id: 'source-agent' }), 'agent-snapshot');
    await assertRejected({ ...input, idempotencyKey: 'request-3' }, 'FORK_SNAPSHOT_UNSEALED');
    const foreign = JSON.parse(JSON.stringify(saved.state));
    foreign._genosSnapshot.persistedState.sections.memories[0].agent_id = 'foreign-agent';
    await db.run('UPDATE agent_state_snapshots SET state_json = ? WHERE id = ?', JSON.stringify(resealState(foreign)), 'agent-snapshot');
    await assertRejected({ ...input, idempotencyKey: 'request-4' }, 'FORK_ARCHIVE_INVALID');
    const pending = JSON.parse(JSON.stringify(saved.state));
    pending._genosSnapshot.persistedState.sections.modelTurns.push({ status: 'pending', agent_id: 'source-agent' });
    await db.run('UPDATE agent_state_snapshots SET state_json = ? WHERE id = ?', JSON.stringify(resealState(pending)), 'agent-snapshot');
    await assertRejected({ ...input, idempotencyKey: 'request-5' }, 'FORK_ARCHIVE_INVALID');
    console.log('Sealed agent fork service contract passed.');
  } finally {
    if (db) await db.close();
    if (path.dirname(root) === os.tmpdir()) await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
