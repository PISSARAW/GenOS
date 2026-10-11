'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { digest } = require('../src/services/organismPersistedState');
const { buildArchiveDescriptor } = require('../src/services/sealedForkArchiveDescriptor');
const { readInheritedOrganismArchive } = require('../src/services/inheritedOrganismArchive');

const TENANT = { organizationId: 'org-1', projectId: 'project-1' };
const AGENT_FIELDS = ['name', 'name_meaning', 'role', 'model_tier', 'language', 'isolation_mode',
  'dissonance_level', 'eureka_count', 'cognitive_budget', 'cognitive_baseline_budget',
  'cognitive_max_dissonance', 'is_apoptotic', 'status', 'current_task'];

function sections() {
  return {
    memories: [
      { id: 'memory-1', agent_id: 'parent', organization_id: 'org-1', project_id: 'project-1',
        action_type: 'review', observation_output: 'opaque-secret-tool-output', reward_score: 0.8,
        created_at: '2026-10-10T00:00:00Z', is_purged: 0 },
      { id: 'memory-forgotten', agent_id: 'parent', organization_id: 'org-1', project_id: 'project-1',
        action_type: 'private', is_purged: 1 }
    ],
    autobiographicalEpisodes: [
      { id: 'episode-1', agent_id: 'parent', organization_id: 'org-1', project_id: 'project-1',
        kind: 'observation', salience: 0.5, lesson_json: '{"secret":"opaque-lesson"}',
        created_at: '2026-10-10T00:00:00Z', is_forgotten: 0 },
      { id: 'episode-forgotten', agent_id: 'parent', organization_id: 'org-1', project_id: 'project-1',
        kind: 'private', is_forgotten: 1 }
    ],
    decisions: [{ id: 'decision-1', created_by: 'parent', organization_id: 'org-1', project_id: 'project-1',
      title: 'Known result', content: 'A reviewed decision', category: 'Architecture',
      embedding_blob: { genosBase64: 'opaque-secret-embedding' }, created_at: '2026-10-10T00:00:00Z' }],
    synapses: [], relations: [], selfModels: [], runtime: null, runtimeCursor: null, modelTurns: []
  };
}

function organismHash(state) {
  const snapshot = state._genosSnapshot;
  const bundle = snapshot.organismSnapshot;
  const agentState = Object.fromEntries(AGENT_FIELDS.map((field) => [field, state[field] ?? null]));
  return digest({ agentId: state.id, workspaceId: state.workspace_id, agentState,
    workspaceSnapshot: snapshot.workspaceSnapshot, persisted: snapshot.persistedState,
    orchestrator: snapshot.orchestratorCheckpoints, components: bundle.components,
    capturedAt: bundle.capturedAt, consistency: bundle.consistency });
}

function sealedState() {
  const persisted = { schemaVersion: 3, sections: sections() };
  persisted.hash = digest(persisted.sections);
  const state = { id: 'parent', workspace_id: 'source-ws', name: 'Source', role: 'reviewer',
    cognitive_budget: 80, status: 'idle' };
  state._genosSnapshot = {
    workspaceSnapshot: { id: 'workspace-snapshot', workspaceId: 'source-ws', hash: 'a'.repeat(64) },
    persistedState: persisted, orchestratorCheckpoints: [],
    organismSnapshot: { schemaVersion: 4, capturedAt: '2026-10-10T00:00:00Z',
      consistency: 'agent-stable; workspace-capture-verified; sqlite-transaction', components: {} }
  };
  state._genosSnapshot.organismSnapshot.hash = organismHash(state);
  return state;
}

function childMetadata(state) {
  const snapshot = state._genosSnapshot;
  return { sourceSnapshotId: 'agent-snapshot', sourceSnapshotHash: snapshot.organismSnapshot.hash,
    workspaceSnapshotHash: snapshot.workspaceSnapshot.hash,
    inheritedArchive: buildArchiveDescriptor({ state, organismHash: snapshot.organismSnapshot.hash },
      { agentId: 'parent', snapshotId: 'agent-snapshot', tenant: TENANT }) };
}

async function seed(db, state) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, parent_agent_id TEXT,
      lineage_relation TEXT, metadata_json TEXT);
    CREATE TABLE agent_state_snapshots (id TEXT PRIMARY KEY, agent_id TEXT, workspace_id TEXT, state_json TEXT);`);
  for (const id of ['source-ws', 'child-ws']) {
    await db.run('INSERT INTO workspaces (id, organization_id, project_id) VALUES (?, ?, ?)',
      id, TENANT.organizationId, TENANT.projectId);
  }
  await db.run('INSERT INTO agents (id, workspace_id) VALUES (?, ?)', 'parent', 'source-ws');
  await db.run(`INSERT INTO agents (id, workspace_id, parent_agent_id, lineage_relation, metadata_json)
    VALUES (?, ?, ?, ?, ?)`, 'child', 'child-ws', 'parent', 'fork', JSON.stringify(childMetadata(state)));
  await db.run('INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json) VALUES (?, ?, ?, ?)',
    'agent-snapshot', 'parent', 'source-ws', JSON.stringify(state));
}

async function writeState(db, state, metadata) {
  await db.run('UPDATE agent_state_snapshots SET state_json = ? WHERE id = ?', JSON.stringify(state), 'agent-snapshot');
  await db.run('UPDATE agents SET metadata_json = ? WHERE id = ?', JSON.stringify(metadata), 'child');
}

function reseal(state, metadata) {
  const selected = Object.fromEntries(['memories', 'autobiographicalEpisodes', 'decisions']
    .map((kind) => [kind, state._genosSnapshot.persistedState.sections[kind]]));
  state._genosSnapshot.persistedState.hash = digest(state._genosSnapshot.persistedState.sections);
  state._genosSnapshot.organismSnapshot.hash = organismHash(state);
  metadata.sourceSnapshotHash = state._genosSnapshot.organismSnapshot.hash;
  metadata.inheritedArchive.organismHash = metadata.sourceSnapshotHash;
  metadata.inheritedArchive.persistedHash = state._genosSnapshot.persistedState.hash;
  metadata.inheritedArchive.sectionsHash = digest(selected);
  metadata.inheritedArchive.counts = Object.fromEntries(Object.entries(selected).map(([kind, rows]) => [kind, rows.length]));
}

async function denied(db, input, code) {
  await assert.rejects(() => readInheritedOrganismArchive({ db, tenant: TENANT,
    childAgentId: 'child', kind: 'memories', ...input }), (error) => error.code === code);
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const original = sealedState();
  try {
    await seed(db, original);
    const base = { db, tenant: TENANT, childAgentId: 'child' };
    const memories = await readInheritedOrganismArchive({ ...base, kind: 'memories', limit: 1 });
    assert.equal(memories.records.length, 1);
    assert.deepEqual(memories.records[0], { kind: 'memories', sourceRecordId: 'memory-1',
      sourceAgentId: 'parent', content: { actionType: 'review', rewardScore: 0.8,
        createdAt: '2026-10-10T00:00:00Z' }, inherited: true, executable: false });
    assert.equal(memories.runtimeTransferred, false);
    assert.equal(memories.source.snapshotId, 'agent-snapshot');
    const episodes = await readInheritedOrganismArchive({ ...base, kind: 'autobiographicalEpisodes' });
    assert.deepEqual(episodes.records.map((row) => row.sourceRecordId), ['episode-1']);
    const decisions = await readInheritedOrganismArchive({ ...base, kind: 'decisions' });
    assert.deepEqual(decisions.records.map((row) => row.content.title), ['Known result']);
    assert.ok(!JSON.stringify({ memories, episodes, decisions }).includes('opaque-secret'));
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM agent_state_snapshots')).n, 1);
    assert.equal((await db.get('SELECT metadata_json FROM agents WHERE id = ?', 'parent')).metadata_json, null);
    await denied(db, { kind: 'runtime' }, 'INHERITED_ARCHIVE_KIND_INVALID');
    await denied(db, { limit: 51 }, 'INHERITED_ARCHIVE_LIMIT_INVALID');
    await denied(db, { tenant: { organizationId: 'org-2', projectId: 'project-1' } }, 'INHERITED_ARCHIVE_CHILD_NOT_FOUND');
    await db.run("UPDATE workspaces SET organization_id = 'org-2' WHERE id = 'source-ws'");
    await denied(db, {}, 'INHERITED_ARCHIVE_SOURCE_NOT_FOUND');
    await db.run("UPDATE workspaces SET organization_id = 'org-1' WHERE id = 'source-ws'");
    const brokenSeal = structuredClone(original);
    brokenSeal._genosSnapshot.persistedState.sections.decisions[0].content = 'tampered';
    await writeState(db, brokenSeal, childMetadata(original));
    await denied(db, {}, 'INHERITED_ARCHIVE_INTEGRITY_FAILED');
    const noArchive = childMetadata(original);
    delete noArchive.inheritedArchive;
    await writeState(db, original, noArchive);
    await denied(db, {}, 'INHERITED_ARCHIVE_UNAVAILABLE');
    const changedOwner = structuredClone(original);
    changedOwner._genosSnapshot.persistedState.sections.memories[0].agent_id = 'foreign-agent';
    const ownerMetadata = childMetadata(original);
    reseal(changedOwner, ownerMetadata);
    await writeState(db, changedOwner, ownerMetadata);
    await denied(db, {}, 'INHERITED_ARCHIVE_INTEGRITY_FAILED');
    const changedScope = structuredClone(original);
    changedScope._genosSnapshot.persistedState.sections.decisions[0].organization_id = 'org-2';
    const scopeMetadata = childMetadata(original);
    reseal(changedScope, scopeMetadata);
    await writeState(db, changedScope, scopeMetadata);
    await denied(db, {}, 'INHERITED_ARCHIVE_INTEGRITY_FAILED');
    const pending = structuredClone(original);
    pending._genosSnapshot.persistedState.sections.modelTurns.push({ id: 'turn', status: 'pending' });
    const pendingMetadata = childMetadata(original);
    reseal(pending, pendingMetadata);
    await writeState(db, pending, pendingMetadata);
    await denied(db, {}, 'INHERITED_ARCHIVE_INTEGRITY_FAILED');
    const opaque = structuredClone(original);
    opaque._genosSnapshot.persistedState.sections.decisions[0].content = { genosBase64: 'opaque' };
    const opaqueMetadata = childMetadata(original);
    reseal(opaque, opaqueMetadata);
    await writeState(db, opaque, opaqueMetadata);
    await denied(db, { kind: 'decisions' }, 'INHERITED_ARCHIVE_RECORD_INVALID');
    console.log('Read-only inherited organism archive, scope, owner and resealed forgery refusals passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
