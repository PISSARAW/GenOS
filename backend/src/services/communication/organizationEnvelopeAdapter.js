'use strict';

const { createEnvelope, verifyEnvelopePayload } = require('./communicationEnvelopeService');

function signalDataWithEnvelope(signalData, envelope) {
  const data = typeof signalData === 'string' ? { payload: signalData } : signalData || {};
  return Object.assign({}, data, { communicationEnvelope: envelope });
}

function payloadWithEnvelope(payload, envelope) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return Object.assign({}, payload, { communicationEnvelope: envelope });
  }
  return { data: payload === undefined ? null : payload, communicationEnvelope: envelope };
}

function createOrganizationEnvelope(input) {
  const target = input.route.recipientAgentId;
  const contentPayload = Object.assign({}, input.contentPayload, {
    payload: normalizePayload(input.contentPayload.payload)
  });
  return createEnvelope({
    messageId: input.messageId,
    kind: 'organization_message',
    senderAgentId: input.senderAgentId,
    recipientAgentIds: target && target !== 'broadcast' ? [target] : [],
    channel: input.route.channel,
    modality: input.signalType,
    semanticRefs: input.payload?.semanticRefs || [],
    artifactRefs: input.payload?.artifactRefs || [],
    scope: input.scope,
    groundingRequired: input.payload?.groundingRequired,
    payload: contentPayload
  });
}

function normalizePayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload;
  return { data: payload === undefined ? null : payload };
}

function verifyOrganizationMessage(row, payload, signal) {
  const payloadEnvelope = payload?.communicationEnvelope;
  const signalEnvelope = signal?.communicationEnvelope;
  if (!payloadEnvelope && !signalEnvelope) return { status: 'legacy_unverified' };
  if (!payloadEnvelope || !signalEnvelope) return { status: 'rejected', reason: 'envelope_missing' };
  const digest = verifyOrganizationDigest({ row, payload, signal, envelope: payloadEnvelope });
  if (!digest.valid || !envelopeMetadataMatches(row, payloadEnvelope, signalEnvelope)) {
    return { status: 'rejected', reason: digest.reason || 'metadata_mismatch' };
  }
  return { status: 'verified', messageId: payloadEnvelope.messageId };
}

function verifyOrganizationDigest(input) {
  const { row, payload, signal, envelope } = input;
  const { communicationEnvelope: ignoredPayloadEnvelope, ...cleanPayload } = payload;
  const { communicationEnvelope: ignoredSignalEnvelope, ...cleanSignal } = signal;
  return verifyEnvelopePayload(envelope, {
    content: row.content, payload: cleanPayload, signalData: cleanSignal
  });
}

function envelopeMetadataMatches(row, envelope, signalEnvelope) {
  return envelopesMatch(envelope, signalEnvelope)
    && recipientsMatch(row, envelope)
    && senderMatches(row, envelope)
    && signalMetadataMatches(row, envelope);
}

function envelopesMatch(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function recipientsMatch(row, envelope) {
  const expected = row.recipientAgentId && row.recipientAgentId !== 'broadcast'
    ? [row.recipientAgentId] : [];
  return JSON.stringify(envelope.recipientAgentIds) === JSON.stringify(expected);
}

function senderMatches(row, envelope) {
  return envelope.senderAgentId === (row.senderAgentId || null);
}

function signalMetadataMatches(row, envelope) {
  return envelope.kind === 'organization_message'
    && envelope.modality === row.signalType
    && envelope.channel === row.channel
    && envelope.scope?.organizationVersion === row.organizationVersion;
}

module.exports = { createOrganizationEnvelope, signalDataWithEnvelope, payloadWithEnvelope, verifyOrganizationMessage };
