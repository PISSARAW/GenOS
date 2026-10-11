/** Fork an idle agent and isolated workspace from a sealed organism snapshot. */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { withTransaction } = require('../db');
const { collectFiles } = require('./workspaceSnapshotCollect');
const { readManifest, getSnapshot, materialize, verifyContentHash } = require('./workspaceSnapshotMaterialize');
const { verifyOrganismSnapshot } = require('../controllers/lineage/snapshots');
const { buildArchiveDescriptor } = require('./sealedForkArchiveDescriptor');

function refusal(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateInput(input) {
  if (!input?.db?.exec || !input.db.get || !input.db.run) throw refusal('FORK_DB_REQUIRED', 'A transactional database is required.');
  if (!input.tenant?.organizationId || !input.tenant?.projectId) throw refusal('FORK_SCOPE_REQUIRED', 'A trusted organization and project are required.');
  validateIdentity(input);
  validateBudgetAndRoot(input);
}

function validateIdentity(input) {
  for (const key of ['agentId', 'snapshotId', 'idempotencyKey']) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value.length > 256) {
      throw refusal('FORK_INPUT_INVALID', `${key} must be a nonempty string of at most 256 characters.`);
    }
  }
}

function validateBudgetAndRoot(input) {
  if (!Number.isSafeInteger(input.budget) || input.budget <= 0) throw refusal('FORK_BUDGET_INVALID', 'budget must be a positive integer.');
  if (typeof input.forkRoot !== 'string' || !path.isAbsolute(input.forkRoot)) {
    throw refusal('FORK_ROOT_REQUIRED', 'A trusted absolute fork root is required.');
  }
}

function childIds(input) {
  const digest = crypto.createHash('sha256').update(JSON.stringify([
    input.tenant.organizationId, input.tenant.projectId, input.agentId, input.snapshotId, input.idempotencyKey
  ])).digest('hex');
  return { agentId: `agent_fork_${digest.slice(0, 32)}`, workspaceId: `ws_fork_${digest.slice(0, 32)}` };
}

async function loadSource(input) {
  const { db, tenant, agentId, snapshotId } = input;
  const agent = await db.get(`SELECT a.*, w.path AS workspace_path FROM agents a JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`, agentId, tenant.organizationId, tenant.projectId);
  const snapshot = await db.get('SELECT * FROM agent_state_snapshots WHERE id = ? AND agent_id = ? AND workspace_id = ?',
    snapshotId, agentId, agent?.workspace_id);
  if (!agent?.workspace_path || !snapshot) throw refusal('FORK_SOURCE_NOT_FOUND', 'Agent or snapshot is unavailable in this scope.');
  const { state, reference, organism } = parseSealedState(snapshot, agent);
  const workspaceSnapshot = await getSnapshot(db, agent.workspace_id, reference.id);
  if (workspaceSnapshot.snapshot_hash !== reference.hash || workspaceSnapshot.workspace_path !== agent.workspace_path) {
    throw refusal('FORK_SNAPSHOT_MISMATCH', 'Workspace snapshot does not match the sealed agent snapshot.');
  }
  const manifest = await readManifest(workspaceSnapshot);
  if (manifest.agent_id !== agentId || manifest.snapshot_id !== reference.id) {
    throw refusal('FORK_SNAPSHOT_MISMATCH', 'Workspace snapshot provenance does not match the source agent.');
  }
  return { agent, state, workspaceSnapshot, manifest, organismHash: organism.hash };
}

function parseSealedState(snapshot, agent) {
  let state;
  try { state = JSON.parse(snapshot.state_json); } catch (_) { throw refusal('FORK_SNAPSHOT_INVALID', 'Snapshot state is not valid JSON.'); }
  const reference = state?._genosSnapshot?.workspaceSnapshot;
  const organism = state?._genosSnapshot?.organismSnapshot;
  const validIdentity = state.id === agent.id && state.workspace_id === agent.workspace_id;
  const validReference = reference?.workspaceId === agent.workspace_id && Boolean(reference?.id && reference?.hash);
  if (!validIdentity || !validReference || !organism?.hash || verifyOrganismSnapshot(state).valid !== true) {
    throw refusal('FORK_SNAPSHOT_UNSEALED', 'A sealed agent and workspace snapshot is required.');
  }
  return { state, reference, organism };
}

function assertOutsideSource(root, sourceRoot) {
  const relative = path.relative(sourceRoot, root);
  const inside = !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  if (inside) throw refusal('FORK_ROOT_OVERLAP', 'Fork root must be outside the source workspace.');
}

async function destination(input, ids, source) {
  const sourceRoot = await fsp.realpath(source.agent.workspace_path);
  assertOutsideSource(path.resolve(input.forkRoot), sourceRoot);
  await fsp.mkdir(input.forkRoot, { recursive: true });
  const root = await fsp.realpath(input.forkRoot);
  assertOutsideSource(root, sourceRoot);
  const target = path.join(root, ids.workspaceId);
  if (path.dirname(target) !== root) throw refusal('FORK_PATH_INVALID', 'Fork destination escapes its configured root.');
  return { root, target };
}

async function verifyMarker(target, marker) {
  const entry = await fsp.lstat(target);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw refusal('FORK_DESTINATION_CONFLICT', 'Fork destination is not a directory.');
  const markerDirectory = path.join(target, '.genos');
  const markerPath = path.join(markerDirectory, 'fork-origin.json');
  const directoryEntry = await fsp.lstat(markerDirectory);
  const markerEntry = await fsp.lstat(markerPath);
  if (directoryEntry.isSymbolicLink() || markerEntry.isSymbolicLink() || !markerEntry.isFile() || markerEntry.size > 8192) {
    throw refusal('FORK_DESTINATION_CONFLICT', 'Fork provenance marker is not a regular file.');
  }
  const stored = JSON.parse(await fsp.readFile(markerPath, 'utf8'));
  if (JSON.stringify(stored) !== JSON.stringify(marker)) throw refusal('FORK_DESTINATION_CONFLICT', 'Fork destination belongs to another operation.');
}

async function verifyDirectory(target, source, marker) {
  await verifyMarker(target, marker);
  verifyContentHash(await collectFiles(target), source.manifest.files, 'Fork destination differs from its sealed snapshot.');
}

async function prepareDirectory(location, source, marker) {
  if (fs.existsSync(location.target)) {
    await verifyDirectory(location.target, source, marker);
    return;
  }
  const staging = await fsp.mkdtemp(path.join(location.root, '.fork-stage-'));
  try {
    await materialize(source.workspaceSnapshot, staging);
    await fsp.mkdir(path.join(staging, '.genos'));
    await fsp.writeFile(path.join(staging, '.genos', 'fork-origin.json'), JSON.stringify(marker));
    try { await fsp.rename(staging, location.target); }
    catch (error) {
      if (!fs.existsSync(location.target)) throw error;
      await verifyDirectory(location.target, source, marker);
    }
  } finally {
    if (path.dirname(staging) === location.root) await fsp.rm(staging, { recursive: true, force: true });
  }
}

async function existingChild(context) {
  const { input, ids, source, location, marker } = context;
  const row = await input.db.get(`SELECT a.id, a.metadata_json, a.workspace_id, a.parent_agent_id, w.path FROM agents a JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
  ids.agentId, input.tenant.organizationId, input.tenant.projectId);
  if (!row) return null;
  const metadata = JSON.parse(row.metadata_json || '{}');
  const observed = [row.workspace_id, row.path, row.parent_agent_id, metadata.sourceSnapshotId,
    metadata.sourceSnapshotHash, metadata.budget, metadata.inheritedArchive];
  const expected = [ids.workspaceId, location.target, input.agentId, input.snapshotId,
    source.organismHash, input.budget, source.archive];
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw refusal('FORK_IDEMPOTENCY_CONFLICT', 'The idempotency key is already bound to another fork.');
  }
  const edge = await input.db.get('SELECT id FROM lineage_edges WHERE id = ? AND workspace_id = ? AND target_node_id = ?',
    `edge_${ids.agentId}`, ids.workspaceId, ids.agentId);
  if (!edge) throw refusal('FORK_LINEAGE_MISSING', 'Fork lineage edge is missing.');
  await verifyMarker(location.target, marker);
  return receipt(context, true);
}

function receipt(context, reused) {
  const { ids, input, source } = context;
  return { success: true, status: 'snapshot_fork_created', childAgentId: ids.agentId,
    childWorkspaceId: ids.workspaceId, sourceAgentId: input.agentId, sourceSnapshotId: input.snapshotId,
    sourceSnapshotHash: source.organismHash, workspaceSnapshotHash: source.workspaceSnapshot.snapshot_hash,
    budget: input.budget, runtimeStarted: false, memoryCloned: false, organismRuntimeRestored: false,
    inheritedArchiveAvailable: true, inheritedArchiveSections: Object.keys(source.archive.counts),
    inheritedArchiveCounts: source.archive.counts, inheritedArchiveHash: source.archive.sectionsHash, reused };
}

async function persistChild(context) {
  const { input, ids, source, location } = context;
  return withTransaction(input.db, async () => {
    const found = await existingChild(context);
    if (found) return found;
    const current = await input.db.get(`SELECT a.cognitive_budget FROM agents a JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
    input.agentId, input.tenant.organizationId, input.tenant.projectId);
    const captured = Number(source.state.cognitive_budget);
    if (!current || !Number.isFinite(captured) || input.budget > captured || input.budget > Number(current.cognitive_budget)) {
      throw refusal('FORK_BUDGET_EXCEEDED', 'Fork budget exceeds the sealed or current parent budget.');
    }
    await input.db.run('UPDATE agents SET cognitive_budget = cognitive_budget - ? WHERE id = ?', input.budget, input.agentId);
    await input.db.run(`INSERT INTO workspaces (id, name, path, visibility, language, description, organization_id, project_id)
      VALUES (?, ?, ?, 'Private', ?, ?, ?, ?)`, ids.workspaceId, `Fork of ${source.agent.name}`, location.target,
    source.agent.language, `Sealed fork from ${input.snapshotId}`, input.tenant.organizationId, input.tenant.projectId);
    const metadata = JSON.stringify({ sourceSnapshotId: input.snapshotId, sourceSnapshotHash: source.organismHash,
      workspaceSnapshotHash: source.workspaceSnapshot.snapshot_hash, budget: input.budget, idempotencyKeyHash:
      crypto.createHash('sha256').update(input.idempotencyKey).digest('hex'), inheritedArchive: source.archive });
    await input.db.run(`INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      cognitive_budget, cognitive_baseline_budget, model_tier, language, isolation_mode, parent_agent_id,
      lineage_relation, metadata_json, current_task) VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'Branch', ?, 'fork', ?, ?)`,
    ids.agentId, `Fork of ${source.agent.name}`, source.state.role, source.agent.agent_type, ids.workspaceId,
    source.agent.fleet_id, input.budget, input.budget, source.state.model_tier, source.state.language,
    input.agentId, metadata, `Forked from sealed snapshot ${input.snapshotId}`);
    const anchor = `origin_${ids.agentId}`;
    await input.db.run(`INSERT INTO lineage_nodes (id, workspace_id, agent_id, snapshot_id, label, node_type, metadata)
      VALUES (?, ?, ?, ?, ?, 'checkpoint', ?)`, anchor, ids.workspaceId, input.agentId, input.snapshotId,
    `Source ${source.agent.name}`, metadata);
    await input.db.run(`INSERT INTO lineage_nodes (id, workspace_id, agent_id, snapshot_id, label, node_type, metadata)
      VALUES (?, ?, ?, ?, ?, 'fork', ?)`, ids.agentId, ids.workspaceId, ids.agentId, input.snapshotId,
    `Fork of ${source.agent.name}`, metadata);
    await input.db.run(`INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, metadata)
      VALUES (?, ?, ?, ?, 'fork', ?)`, `edge_${ids.agentId}`, ids.workspaceId, anchor, ids.agentId, metadata);
    return receipt(context, false);
  });
}

async function forkFromSealedSnapshot(input) {
  validateInput(input);
  const source = await loadSource(input);
  source.archive = buildArchiveDescriptor(source, input);
  const ids = childIds(input);
  const location = await destination(input, ids, source);
  const marker = { sourceAgentId: input.agentId, sourceSnapshotId: input.snapshotId,
    sourceSnapshotHash: source.organismHash, workspaceSnapshotHash: source.workspaceSnapshot.snapshot_hash,
    childAgentId: ids.agentId, childWorkspaceId: ids.workspaceId };
  const context = { input, ids, source, location, marker };
  const found = await existingChild(context);
  if (found) return found;
  try { await prepareDirectory(location, source, marker); }
  catch (error) {
    const committed = await existingChild(context);
    if (committed) return committed;
    throw error;
  }
  return persistChild(context);
}

module.exports = { forkFromSealedSnapshot };
