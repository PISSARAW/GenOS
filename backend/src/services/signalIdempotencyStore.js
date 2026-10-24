'use strict';

const crypto = require('node:crypto');
const { hashKey } = require('./communication/communicationIdempotency');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function payloadIdentity(signalData) {
  const payload = { ...signalData };
  delete payload.communicationEnvelope;
  const checkpointContent = payload.content?.content;
  if (checkpointContent && typeof checkpointContent === 'object') {
    const { utility, ...stableContent } = checkpointContent;
    payload.content = { ...payload.content, content: stableContent };
  }
  return payload;
}

function buildRecord(signal, routing, key) {
  const envelope = signal.signalData.communicationEnvelope;
  const fingerprintInput = { signalType: signal.normalizedType, senderAgentId: signal.senderAgentId,
    topic: signal.topic, recipientAgentIds: (routing.recipients || [])
      .filter((entry) => entry.kind === 'agent' && entry.agentId).map((entry) => entry.agentId).sort(),
    channel: envelope.channel, semanticRefs: [...envelope.semanticRefs].sort(),
    artifactRefs: [...envelope.artifactRefs].sort(), scope: envelope.scope,
    groundingRequired: envelope.groundingRequired, payload: payloadIdentity(signal.signalData) };
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify(stableValue(fingerprintInput))).digest('hex');
  return { keyHash: hashKey(key), fingerprint };
}

async function existingPublication(db, signal, record) {
  const row = await db.get(`SELECT signal_id AS signalId, sender_agent_id AS senderAgentId,
    request_fingerprint AS fingerprint FROM signal_idempotency_keys WHERE key_hash = ?`,
  [record.keyHash]);
  if (!row) return null;
  if (row.signalId !== signal.id || row.senderAgentId !== signal.senderAgentId
    || row.fingerprint !== record.fingerprint) {
    throw new Error('Signal idempotency key was reused for a conflicting publication.');
  }
  return { signalId: signal.id, published: true, idempotentReplay: true,
    signalType: signal.formatted.signalType };
}

async function persist(db, signal, record) {
  await db.run(`INSERT INTO signal_idempotency_keys
    (key_hash, signal_id, sender_agent_id, request_fingerprint) VALUES (?, ?, ?, ?)`,
  record.keyHash, signal.id, signal.senderAgentId, record.fingerprint);
}

module.exports = { buildRecord, existingPublication, persist };
