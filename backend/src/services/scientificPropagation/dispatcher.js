const { claimEvents, ackEvent, releaseEvent } = require('./outbox');
const { decodeSignalRow } = require('../signalEnvelopeCodec');
const { referenceStatus } = require('./referenceState');

function signalIdFor(eventId) {
  if (!/^[a-f0-9]{64}$/i.test(eventId)) throw new Error('Invalid scientific outbox event id');
  return `sig_scientific_${eventId}`;
}

async function hasDurableDelivery(db, input) {
  const row = await db.get(`SELECT s.signal_id, s.signal_type, s.signal_blob,
      s.sender_agent_id, d.status FROM signal_deliveries d
    JOIN signal_blobs s ON s.signal_id = d.signal_id
    WHERE d.signal_id = ? AND d.subscriber_agent_id = ?`,
  [input.signalId, input.recipientAgentId]);
  if (!row || !['pending', 'delivered', 'seen', 'acked'].includes(row.status)) return false;
  const signal = decodeSignalRow(row);
  const envelope = signal.decoded?.communicationEnvelope;
  return signal.integrity.status === 'verified' &&
    signal.signalType === 'ligand' && signal.senderAgentId === input.senderAgentId &&
    envelope.recipientMode === 'targeted' &&
    envelope.recipientAgentIds.includes(input.recipientAgentId) &&
    signal.decoded.outboxEventId === input.eventId &&
    JSON.stringify(signal.decoded.scientificRef) === JSON.stringify(input.ref);
}

function signalParams(row, payload) {
  const ref = JSON.parse(row.subject_ref_json);
  return {
    signalId: signalIdFor(row.event_id), signalType: 'ligand',
    senderAgentId: payload.senderAgentId,
    recipientAgentIds: [row.recipient_agent_id],
    topic: `scientific:${row.event_type}`,
    signalData: {
      ...payload,
      ligand: 'scientific_reference', concentration: 1,
      eventType: row.event_type, outboxEventId: row.event_id,
      idempotencyKey: row.event_id, scientificEventId: row.event_id,
      scientificRef: ref,
      artifactRef: `scientific:${row.subject_key}`,
    },
  };
}

function publishAccepted(result, expectedSignalId) {
  return result?.published === true && result.signalId === expectedSignalId
    && result.llmRequired !== true && result.coalesced !== true
    && result.suppressed !== true;
}

async function publishDisposition(db, row, ref) {
  if (row.event_type !== 'publish') return 'send';
  const status = await referenceStatus(db, ref);
  if (status === 'stale') return 'superseded';
  if (status !== 'verified') throw new Error('Scientific publish reference is unavailable');
  return 'send';
}

async function dispatchClaim(db, input) {
  const { row, publishSignal, workerId } = input;
  const claim = { eventId: row.event_id, workerId, claimToken: row.claim_token };
  try {
    const payload = JSON.parse(row.payload_json);
    const senderAgentId = String(payload.senderAgentId || '').trim();
    if (!senderAgentId || !row.recipient_agent_id) throw new Error('Scientific signal sender and recipient required');
    const params = signalParams(row, { ...payload, senderAgentId });
    const delivery = { signalId: params.signalId, recipientAgentId: row.recipient_agent_id,
      senderAgentId, eventId: row.event_id, ref: JSON.parse(row.subject_ref_json) };
    if (await hasDurableDelivery(db, delivery)) {
      return { eventId: row.event_id, acked: await ackEvent(db, claim), recovered: true };
    }
    if (await publishDisposition(db, row, delivery.ref) === 'superseded') {
      return { eventId: row.event_id, acked: await ackEvent(db, claim), superseded: true };
    }
    const result = await publishSignal(params);
    if (!publishAccepted(result, params.signalId)) throw new Error('Signal not durably routed');
    if (!await hasDurableDelivery(db, delivery)) throw new Error('Signal delivery absent');
    return { eventId: row.event_id, acked: await ackEvent(db, claim), recovered: false };
  } catch (error) {
    await releaseEvent(db, { ...claim, attempts: row.attempts });
    return { eventId: row.event_id, acked: false, reason: error.message };
  }
}

async function dispatchOutbox(db, input) {
  const publishSignal = input?.publishSignal ||
    ((params) => require('./transport').publishScientificSignal(db, params));
  if (typeof publishSignal !== 'function') throw new Error('publishSignal function required');
  const rows = await claimEvents(db, input);
  const outcomes = [];
  for (const row of rows) {
    outcomes.push(await dispatchClaim(db, { row, publishSignal, workerId: input.workerId }));
  }
  return outcomes;
}

module.exports = { dispatchOutbox, signalIdFor, hasDurableDelivery };
