/** Read sealed parent memories as attributed history, without importing runtime state. */
'use strict';

const persistedState = require('./organismPersistedState');
const { buildArchiveDescriptor } = require('./sealedForkArchiveDescriptor');
const { verifyOrganismSnapshot } = require('../controllers/lineage/snapshots');

const KINDS = new Set(['memories', 'autobiographicalEpisodes', 'decisions']);
const MAX_LIMIT = 50;
const MAX_RECORD_BYTES = 16 * 1024;

function refusal(code, message) {
  return Object.assign(new Error(message), { code });
}

function validText(value) {
  return typeof value === 'string' && value.length > 0;
}

function assertRequestScope(input) {
  if (typeof input?.db?.get !== 'function' || !validText(input.tenant?.organizationId) ||
      !validText(input.tenant?.projectId) || !validText(input.childAgentId)) {
    throw refusal('INHERITED_ARCHIVE_SCOPE_REQUIRED', 'A scoped child and database are required.');
  }
}

function requestOptions(input) {
  assertRequestScope(input);
  if (!KINDS.has(input.kind)) throw refusal('INHERITED_ARCHIVE_KIND_INVALID', 'Archive kind is not available.');
  const limit = input.limit === undefined ? 20 : input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw refusal('INHERITED_ARCHIVE_LIMIT_INVALID', 'Archive limit must be between 1 and 50.');
  }
  return limit;
}

async function scopedAgent(db, tenant, agentId) {
  return db.get(`SELECT a.id, a.workspace_id, a.parent_agent_id, a.lineage_relation, a.metadata_json
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
  agentId, tenant.organizationId, tenant.projectId);
}

function archiveMetadata(child) {
  let metadata;
  try { metadata = JSON.parse(child.metadata_json || '{}'); }
  catch (_) { throw refusal('INHERITED_ARCHIVE_INVALID', 'Child fork metadata is invalid.'); }
  const archive = metadata?.inheritedArchive;
  if (child.lineage_relation !== 'fork' || !child.parent_agent_id ||
      archive?.schema !== 'genos.fork-inherited-archive/v1' ||
      archive.sourceAgentId !== child.parent_agent_id ||
      archive.sourceSnapshotId !== metadata.sourceSnapshotId ||
      archive.organismHash !== metadata.sourceSnapshotHash) {
    throw refusal('INHERITED_ARCHIVE_UNAVAILABLE', 'Child has no verified inherited archive.');
  }
  return { metadata, archive };
}

async function sourceState(input, child, metadata) {
  const source = await scopedAgent(input.db, input.tenant, child.parent_agent_id);
  if (!source) throw refusal('INHERITED_ARCHIVE_SOURCE_NOT_FOUND', 'Source agent is unavailable in this scope.');
  const snapshot = await input.db.get(`SELECT state_json FROM agent_state_snapshots
    WHERE id = ? AND agent_id = ? AND workspace_id = ?`,
  metadata.sourceSnapshotId, source.id, source.workspace_id);
  if (!snapshot) throw refusal('INHERITED_ARCHIVE_SOURCE_NOT_FOUND', 'Source snapshot is unavailable in this scope.');
  let state;
  try { state = JSON.parse(snapshot.state_json); }
  catch (_) { throw refusal('INHERITED_ARCHIVE_INVALID', 'Source snapshot JSON is invalid.'); }
  return { source, state };
}

function assertSourceIdentity(context) {
  const { source, state, metadata, archive } = context;
  const reference = state?._genosSnapshot?.workspaceSnapshot;
  if (state?.id !== source.id || state.workspace_id !== source.workspace_id ||
      reference?.workspaceId !== source.workspace_id || reference.hash !== metadata.workspaceSnapshotHash ||
      archive.sourceAgentId !== source.id) {
    throw refusal('INHERITED_ARCHIVE_INTEGRITY_FAILED', 'Source archive identity is invalid.');
  }
}

function assertSourceSeal(context) {
  const { state, archive } = context;
  const bundle = state?._genosSnapshot?.organismSnapshot;
  const persisted = state?._genosSnapshot?.persistedState;
  if (!bundle?.hash || bundle.hash !== archive.organismHash ||
      !persistedState.verify(persisted) || persisted.hash !== archive.persistedHash ||
      verifyOrganismSnapshot(state).valid !== true) {
    throw refusal('INHERITED_ARCHIVE_INTEGRITY_FAILED', 'Source archive seal is invalid.');
  }
  return { bundle, persisted };
}

function verifiedSections(input, context) {
  assertSourceIdentity(context);
  const { bundle, persisted } = assertSourceSeal(context);
  const { source, state, metadata, archive } = context;
  let expected;
  try {
    expected = buildArchiveDescriptor({ state, organismHash: bundle.hash }, {
      agentId: source.id, snapshotId: metadata.sourceSnapshotId, tenant: input.tenant
    });
  } catch (error) {
    if (error.code !== 'FORK_ARCHIVE_INVALID') throw error;
    throw refusal('INHERITED_ARCHIVE_INTEGRITY_FAILED', 'Source archive sections are invalid.');
  }
  assertDescriptor(archive, expected);
  return persisted.sections;
}

function assertDescriptor(stored, expected) {
  const fields = ['schema', 'sourceAgentId', 'sourceSnapshotId', 'organismHash', 'persistedHash', 'sectionsHash'];
  if (fields.some((field) => stored[field] !== expected[field]) ||
      !stored.counts || Object.keys(stored.counts).length !== Object.keys(expected.counts).length ||
      Object.keys(expected.counts).some((kind) => stored.counts?.[kind] !== expected.counts[kind])) {
    throw refusal('INHERITED_ARCHIVE_INTEGRITY_FAILED', 'Child archive descriptor differs from its sealed source.');
  }
}

function contentFor(kind, row) {
  if (kind === 'memories') return { actionType: row.action_type,
    rewardScore: row.reward_score, createdAt: row.created_at };
  if (kind === 'autobiographicalEpisodes') return { kind: row.kind,
    salience: row.salience, createdAt: row.created_at };
  return { title: row.title, content: row.content, category: row.category, createdAt: row.created_at };
}

function archiveRecord(kind, row, sourceAgentId) {
  const content = contentFor(kind, row);
  if (Object.values(content).some((value) => value != null &&
      !['string', 'number', 'boolean'].includes(typeof value))) {
    throw refusal('INHERITED_ARCHIVE_RECORD_INVALID', 'Inherited archive record has opaque content.');
  }
  if (Buffer.byteLength(JSON.stringify(content)) > MAX_RECORD_BYTES) {
    throw refusal('INHERITED_ARCHIVE_RECORD_TOO_LARGE', 'Inherited archive record exceeds the read limit.');
  }
  return { kind, sourceRecordId: row.id, sourceAgentId, content, inherited: true, executable: false };
}

function visibleRows(kind, rows) {
  if (kind === 'memories') return rows.filter((row) => !row.is_purged);
  if (kind === 'autobiographicalEpisodes') return rows.filter((row) => !row.is_forgotten);
  return rows;
}

async function readInheritedOrganismArchive(input) {
  const limit = requestOptions(input);
  const child = await scopedAgent(input.db, input.tenant, input.childAgentId);
  if (!child) throw refusal('INHERITED_ARCHIVE_CHILD_NOT_FOUND', 'Child agent is unavailable in this scope.');
  const { metadata, archive } = archiveMetadata(child);
  const { source, state } = await sourceState(input, child, metadata);
  const sections = verifiedSections(input, { source, state, metadata, archive });
  const records = visibleRows(input.kind, sections[input.kind]).slice(0, limit)
    .map((row) => archiveRecord(input.kind, row, source.id));
  return { source: { agentId: source.id, snapshotId: metadata.sourceSnapshotId,
    organismHash: archive.organismHash, persistedHash: archive.persistedHash },
    kind: input.kind, records, inherited: true, runtimeTransferred: false };
}

module.exports = { readInheritedOrganismArchive };
