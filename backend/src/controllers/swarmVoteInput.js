/**
 * GenOS swarm vote input parsing and voter authorization (controller module).
 *
 * Keeps the HTTP naming contract (agentId/agentName in camelCase) and the
 * participant identity checks in one place. Delegated by swarmController.
 */
const { sanitizeString } = require('../middleware/security');

function resolveVoteIdentity(body, user) {
  const fallback = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const rawId = body.agentId || user.keyId || user.username || fallback;
  const agentId = sanitizeString(String(rawId)).trim();
  const rawName = body.agentName || user.username || agentId;
  const agentName = sanitizeString(String(rawName)).trim();
  return { agentId, agentName, requested: body.agentId };
}

function voteInvalid(vote) {
  if (vote !== 'yes' && vote !== 'no' && vote !== 'abstain') return true;
  return false;
}

function parseVoteBody(req) {
  const body = req.body || {};
  if (body.agent_id !== undefined || body.agent_name !== undefined) return { error: 'INVALID_FIELD_NAMING' };
  const user = req.user || {};
  const identity = resolveVoteIdentity(body, user);
  const proposalId = sanitizeString(String(body.proposalId || '')).trim();
  const vote = String(body.vote || 'yes').trim().toLowerCase();
  const reason = sanitizeString(String(body.reason || '')).trim();
  if (proposalId === '' || voteInvalid(vote)) return { error: 'INVALID_VOTE' };
  return { proposalId, vote, reason, agentId: identity.agentId, agentName: identity.agentName, requested: identity.requested };
}

function isPrivileged(user) {
  if (user.role === 'admin') return true;
  const permissions = user.permissions;
  if (Array.isArray(permissions) && permissions.indexOf('all') >= 0) return true;
  return false;
}

function authorizeVoter(pack) {
  const user = pack.req.user || {};
  const authenticated = user.keyId || user.username;
  if (pack.requested && authenticated && pack.requested !== authenticated && isPrivileged(user) === false) {
    return { code: 'VOTE_AGENT_FORBIDDEN', message: 'agentId must match the authenticated participant.' };
  }
  return null;
}

module.exports = {
  resolveVoteIdentity,
  voteInvalid,
  parseVoteBody,
  isPrivileged,
  authorizeVoter
};
