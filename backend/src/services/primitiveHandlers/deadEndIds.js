/**
 * GenOS dead-end identity helpers.
 * IDs are random (crypto.randomUUID) so every stored dead-end is unique by
 * primary key, while the DEDUP hash is computed from stable fields only
 * (agent, detail, step — no timestamp, no randomness): persisting the same
 * failure twice yields the same id, and INSERT OR IGNORE drops the
 * duplicate instead of flooding genome_decisions.
 */
const crypto = require('crypto');

function newDeadEndId() {
  return 'dec-fail-' + crypto.randomUUID();
}

function deadEndFingerprint(agentId, detail, step) {
  return JSON.stringify({ agentId: agentId, detail: detail, step: step });
}

function deadEndDedupHash(agentId, detail, step) {
  const fingerprint = deadEndFingerprint(agentId, detail, step);
  const digest = crypto.createHash('sha256').update(fingerprint).digest('hex');
  return 'dec-fail-' + digest.slice(0, 32);
}

function resolveDeadEndIdentity(deadEnd, options) {
  const source = options || {};
  const agent = source.agentId || source.createdBy || 'strategy_adapter';
  const detail = deadEnd.detail || deadEnd.error || deadEnd.action || 'Pruned trajectory dead-end';
  const step = deadEnd.step || deadEnd.id || 'dead_end';
  return { agent: agent, detail: detail, step: step };
}

function buildDeadEndTitle(deadEnd, detail) {
  const head = String(deadEnd.action || deadEnd.step || 'Step').slice(0, 30);
  return 'Dead-End: ' + head + ' - ' + String(detail).slice(0, 60);
}

module.exports = { newDeadEndId, deadEndFingerprint, deadEndDedupHash, resolveDeadEndIdentity, buildDeadEndTitle };
