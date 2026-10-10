'use strict';

const { getDatabase } = require('../../../db');
const { readInheritedOrganismArchive } = require('../../inheritedOrganismArchive');

function configuredScope() {
  const env = process.env;
  if (!env.GENOS_MCP_ORGANIZATION_ID || !env.GENOS_MCP_PROJECT_ID || !env.GENOS_MCP_AGENT_ID) return null;
  return { tenant: { organizationId: env.GENOS_MCP_ORGANIZATION_ID,
    projectId: env.GENOS_MCP_PROJECT_ID }, agentId: env.GENOS_MCP_AGENT_ID };
}

function hasProvenance(source) {
  return source && ['agentId', 'snapshotId', 'organismHash', 'persistedHash']
    .every((field) => typeof source[field] === 'string' && source[field]);
}

function validRecords(archive, kind, limit) {
  if (!Array.isArray(archive.records) || archive.records.length > limit) return false;
  return archive.records.every((record) => record.kind === kind &&
    record.sourceAgentId === archive.source.agentId &&
    record.inherited === true && record.executable === false);
}

function validArchive(archive, kind, limit) {
  if (!archive || archive.kind !== kind || archive.inherited !== true ||
      archive.runtimeTransferred !== false) return false;
  if (!hasProvenance(archive.source) || !validRecords(archive, kind, limit)) return false;
  return Buffer.byteLength(JSON.stringify(archive), 'utf8') <= 256 * 1024;
}

async function handleInheritedMemoryRead(args) {
  const scope = configuredScope();
  if (!scope) return { configured: false, success: false, status: 'archive_scope_unavailable',
    code: 'MCP_AGENT_ARCHIVE_NOT_CONFIGURED', error: 'A server-bound agent and tenant are required.' };
  if (args.agent_id !== scope.agentId) return { configured: true, success: false,
    status: 'agent_scope_denied', code: 'MCP_AGENT_ID_MISMATCH',
    error: 'Requested agent does not match the server-bound agent.' };
  const limit = args.limit === undefined ? 20 : args.limit;
  const archive = await readInheritedOrganismArchive({ db: await getDatabase(), tenant: scope.tenant,
    childAgentId: scope.agentId, kind: args.kind, limit });
  if (!validArchive(archive, args.kind, limit)) {
    return { configured: true, success: false, status: 'archive_contract_invalid',
      code: 'MCP_AGENT_ARCHIVE_CONTRACT_INVALID', error: 'Inherited archive response failed its MCP bounds.' };
  }
  return { ...archive, configured: true, success: true, status: 'inherited_memory_read' };
}

function handleInheritedMemoryReadError(error) {
  const code = typeof error.code === 'string' && error.code.startsWith('INHERITED_')
    ? error.code : 'MCP_AGENT_ARCHIVE_FAILED';
  return { configured: true, success: false, status: 'archive_read_refused', code,
    error: code === 'MCP_AGENT_ARCHIVE_FAILED' ? 'Inherited archive read failed.' : error.message };
}

module.exports = { handleInheritedMemoryRead, handleInheritedMemoryReadError };
