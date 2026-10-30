'use strict';

const { unpackSignalPayload } = require('../biomimeticSignalingBus');
const { verifyOrganizationMessage } = require('./organizationEnvelopeAdapter');

function parsePayload(value) {
  try { return JSON.parse(value || '{}'); }
  catch (_) { return {}; }
}

function anonymousPayload(value) {
  if (!value || typeof value !== 'object') return value;
  const { communicationEnvelope, communicationPolicy, ...content } = value;
  return content;
}

function anonymousProjection(message) {
  const { payloadJson, signalBlob, senderName, senderNameMeaning, senderRole, ...view } = message;
  return { ...view, senderAgentId: 'anonymous_worker', senderName: null,
    senderNameMeaning: null, senderRole: null,
    payload: anonymousPayload(view.payload), signal: anonymousPayload(view.signal),
    integrity: { ...view.integrity, projection: 'anonymous', checkedRepresentation: 'stored' } };
}

function projectInboxMessage(row) {
  const signal = unpackSignalPayload(row.signalBlob, row.signalType, row.payloadJson);
  const payload = parsePayload(row.payloadJson);
  const integrity = verifyOrganizationMessage(row, payload, signal);
  const rejected = integrity.status === 'rejected';
  const message = { ...row, content: rejected ? '' : row.content,
    payload: rejected ? null : payload, signal: rejected ? null : signal, integrity,
    hasBiomimeticSignal: !rejected && row.signalType !== 'text' && Boolean(signal) };
  return row.organization === 'blind_adversarial_review' ? anonymousProjection(message) : message;
}

module.exports = { projectInboxMessage };
