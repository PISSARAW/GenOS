/**
 * GenOS swarm proposal creation helpers (controller module).
 *
 * Proposal input parsing, expiry resolution and workspace lookup.
 * The default quorum threshold is the shared DEFAULT_THRESHOLD (0.5).
 * Delegated by swarmController.
 */
const { sanitizeString } = require('../middleware/security');
const qp = require('../services/primitiveHandlers/quorumPolicy');

function proposalThresholdOf(body) {
  if (body.quorumThreshold === undefined || body.quorumThreshold === null) return qp.DEFAULT_THRESHOLD;
  return Number(body.quorumThreshold);
}

function resolveProposalExpiry(body) {
  if (body.inputExpiresAt) {
    const parsed = new Date(body.inputExpiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return null;
  }
  const ttl = Number(body.ttlHours);
  if (Number.isFinite(ttl) && ttl > 0) return new Date(Date.now() + ttl * 3600000).toISOString();
  return null;
}

async function fetchWorkspaceForProposal(db, tenant, workspaceId) {
  if (tenant) return db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspaceId, tenant.organizationId, tenant.projectId);
  return db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
}

function proposalInputOf(body, user) {
  const rawTitle = body.title || 'Swarm Proposal';
  const title = sanitizeString(String(rawTitle)).trim();
  const description = sanitizeString(String(body.description || ''));
  const name = sanitizeString(String(user.username || 'operator')).trim();
  const agentId = String(user.keyId || name);
  const threshold = proposalThresholdOf(body);
  let consensusType = 'simple';
  if (body.consensusType === 'brier_weighted') consensusType = 'brier_weighted';
  if (!title || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) return { error: true };
  return { title, description, name, agentId, threshold, consensusType };
}

module.exports = {
  proposalThresholdOf,
  resolveProposalExpiry,
  fetchWorkspaceForProposal,
  proposalInputOf
};
