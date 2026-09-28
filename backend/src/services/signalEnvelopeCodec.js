'use strict';

const { unpackSignalPayload } = require('./biomimeticSignalingBus');
const { verifyEnvelopePayload } = require('./communication/communicationEnvelopeService');

function decodeSignalRow(row) {
  const decoded = row.signal_blob ? unpackSignalPayload(row.signal_blob, row.signal_type) : null;
  const envelope = decoded?.communicationEnvelope;
  const result = {
    signalId: row.signal_id,
    signalType: row.signal_type,
    signalBlob: row.signal_blob,
    content: row.content,
    topic: row.topic,
    senderAgentId: row.sender_agent_id,
    createdAt: row.created_at,
    decoded,
  };
  if (!envelope) return { ...result, integrity: { status: 'legacy_unverified' } };
  const { communicationEnvelope, ...payload } = decoded;
  const verification = verifyEnvelopePayload(communicationEnvelope, payload);
  const boundToRow = communicationEnvelope.messageId === row.signal_id
    && communicationEnvelope.senderAgentId === (row.sender_agent_id || null)
    && communicationEnvelope.modality === row.signal_type;
  if (!verification.valid || !boundToRow) {
    return { ...result, decoded: null, integrity: { status: 'rejected', reason: verification.reason || 'metadata_mismatch' } };
  }
  return { ...result, integrity: { status: 'verified', messageId: communicationEnvelope.messageId } };
}

module.exports = { decodeSignalRow };
