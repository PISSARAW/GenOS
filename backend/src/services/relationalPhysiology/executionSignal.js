'use strict';

const { digest } = require('./index');
const { createEnvelope } = require('../communication/communicationEnvelopeService');
const { formatSignalForTransport } = require('../biomimeticSignalingBus');

function signalIdFor(plan) {
  return `rpe_${digest({ scope: plan.scope, operationId: plan.operationId })}`;
}

function signalPayload(plan, planHash, at) {
  const payload = {
    semanticType: 'RPE_TYPED_REFS', refs: plan.refs, event: plan.event,
    requiredAck: plan.requiredAck, planHash
  };
  const envelope = createEnvelope({
    messageId: signalIdFor(plan), kind: 'signal', senderAgentId: plan.actorId,
    recipientAgentIds: [plan.receiverId], channel: 'relational', modality: 'ligand',
    semanticRefs: plan.refs.map((ref) => ref.id), scope: plan.scope,
    groundingRequired: plan.requiredAck, ttlMs: 60_000,
    createdAt: new Date(at).toISOString(), payload
  });
  return { ...payload, communicationEnvelope: envelope };
}

async function admitSignal(db, input) {
  const { plan, planHash, at } = input;
  const id = signalIdFor(plan);
  const packed = formatSignalForTransport({
    signalType: 'ligand', signalData: signalPayload(plan, planHash, at)
  });
  const topic = `rpe/${digest({ scope: plan.scope, receiverId: plan.receiverId }).slice(0, 32)}`;
  await db.run(
    `INSERT INTO signal_blobs
     (signal_id, signal_type, signal_blob, content, topic, sender_agent_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, packed.signalType, packed.signalBlob, packed.content, topic,
      plan.actorId, new Date(at + 60_000).toISOString()]
  );
  await db.run(
    `INSERT OR IGNORE INTO signal_subscriptions (subscriber_agent_id, topic)
     VALUES (?, ?)`, [plan.receiverId, topic]
  );
  await db.run(
    `INSERT INTO signal_deliveries (signal_id, subscriber_agent_id, status)
     VALUES (?, ?, 'pending')`, [id, plan.receiverId]
  );
  return { signalId: id, published: true, delivery: 'pending' };
}

module.exports = { admitSignal };
