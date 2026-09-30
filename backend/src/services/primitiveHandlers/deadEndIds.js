/**
 * GenOS dead-end identity helpers.
 * IDs are random (crypto.randomUUID) so every stored dead-end is unique by
 * primary key, while the DEDUP hash is computed from stable fields only
 * (agent, detail, step, action — no timestamp or randomness): persisting the
 * same failure twice yields the same id, while distinct actions at the same
 * step and with the same error remain separate negative knowledge.
 */
const crypto = require('crypto');

function newDeadEndId() {
  return 'dec-fail-' + crypto.randomUUID();
}

function deadEndFingerprint(identity) {
  const source = identity || {};
  return JSON.stringify({
    agentId: source.agent,
    detail: source.detail,
    step: source.step,
    action: source.action || null
  });
}

function deadEndDedupHash(identity) {
  const fingerprint = deadEndFingerprint(identity);
  const digest = crypto.createHash('sha256').update(fingerprint).digest('hex');
  return 'dec-fail-' + digest.slice(0, 32);
}

function resolveDeadEndIdentity(deadEnd, options) {
  const source = options || {};
  const agent = source.agentId || source.createdBy || 'strategy_adapter';
  const detail = deadEnd.detail || deadEnd.error || deadEnd.action || 'Pruned trajectory dead-end';
  const step = deadEnd.step || deadEnd.id || 'dead_end';
  return { agent: agent, detail: detail, step: step, action: deadEnd.action || null };
}

function buildDeadEndTitle(deadEnd, detail) {
  const head = String(deadEnd.action || deadEnd.step || 'Step').slice(0, 30);
  return 'Dead-End: ' + head + ' - ' + String(detail).slice(0, 60);
}

module.exports = { newDeadEndId, deadEndFingerprint, deadEndDedupHash, resolveDeadEndIdentity, buildDeadEndTitle };
