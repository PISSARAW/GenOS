/** Evidence descriptor for read-only memory inherited from a sealed parent snapshot. */
'use strict';

const crypto = require('crypto');

const EXPOSED = Object.freeze({
  memories: 'agent_id',
  autobiographicalEpisodes: 'agent_id',
  decisions: 'created_by'
});

function refusal(message) {
  return Object.assign(new Error(message), { code: 'FORK_ARCHIVE_INVALID' });
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validIdentity(row, ownerKey, sourceAgentId) {
  return row && typeof row === 'object' && !Array.isArray(row) && typeof row.id === 'string' &&
    row.id.length > 0 && row[ownerKey] === sourceAgentId;
}

function validScope(row, tenant) {
  const global = row.organization_id == null && row.project_id == null;
  const scoped = row.organization_id === tenant.organizationId && row.project_id === tenant.projectId;
  return global || scoped;
}

function assertRow(row, context) {
  const { ownerKey, sourceAgentId, tenant } = context;
  if (!validIdentity(row, ownerKey, sourceAgentId)) throw refusal('Inherited archive contains a foreign or invalid record.');
  if (!validScope(row, tenant)) throw refusal('Inherited archive scope mismatch.');
}

function assertUniqueIds(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) throw refusal('Inherited archive contains duplicate record IDs.');
    ids.add(row.id);
  }
}

function validateSelected(sections, context) {
  const selected = {};
  for (const [name, ownerKey] of Object.entries(EXPOSED)) {
    const rows = sections[name];
    if (!Array.isArray(rows)) throw refusal(`Inherited archive ${name} section is missing.`);
    for (const row of rows) assertRow(row, { ...context, ownerKey });
    assertUniqueIds(rows);
    selected[name] = rows;
  }
  return selected;
}

function buildArchiveDescriptor(source, input) {
  const persisted = source.state._genosSnapshot?.persistedState;
  const sections = persisted?.sections;
  if (!persisted?.hash || !sections || !Array.isArray(sections.modelTurns) ||
      sections.modelTurns.some(turn => !turn || turn.status === 'pending')) {
    throw refusal('Inherited archive requires completed model turns and persisted sections.');
  }
  const selected = validateSelected(sections, { sourceAgentId: input.agentId, tenant: input.tenant });
  return { schema: 'genos.fork-inherited-archive/v1', sourceAgentId: input.agentId,
    sourceSnapshotId: input.snapshotId, organismHash: source.organismHash, persistedHash: persisted.hash,
    sectionsHash: digest(selected), counts: Object.fromEntries(Object.entries(selected).map(([name, rows]) => [name, rows.length])) };
}

module.exports = { buildArchiveDescriptor };
