'use strict';

// Refresh of provenance envelopes when buffered organization messages are
// flushed across a topology change.
//
// The flush rewrites the row's organization, version and channel. The
// envelope embedded in the payload/signal still carries the pre-flush
// values, so integrity verification would reject the released message and
// the inbox would deliver it with a null signal. Re-issuing the envelope
// (new channel/scope, recomputed digest over the untouched content) keeps
// released messages verifiable. Unparseable rows are skipped: the flush
// itself still proceeds, exactly as before this refresh existed.

const { packSignalPayload, unpackSignalPayload } = require('../biomimeticSignalingBus');
const { digestPayload } = require('./communicationEnvelopeService');

function refreshedEnvelope(input) {
  const { row, channel, version } = input;
  try {
    const payload = JSON.parse(row.payload_json || '{}');
    if (!payload.communicationEnvelope) return null;
    const signal = unpackSignalPayload(row.signal_blob, row.signal_type, row.payload_json) || {};
    const { communicationEnvelope: _payloadEnvelope, ...cleanPayload } = payload;
    const { communicationEnvelope: _signalEnvelope, ...cleanSignal } = signal;
    const next = { ...payload.communicationEnvelope, channel, scope: { ...payload.communicationEnvelope.scope, organizationVersion: version } };
    next.payloadDigest = digestPayload({ content: row.content, payload: cleanPayload, signalData: cleanSignal });
    return {
      payloadJson: JSON.stringify({ ...cleanPayload, communicationEnvelope: next }),
      signalBlob: packSignalPayload(row.signal_type, { ...cleanSignal, communicationEnvelope: next })
    };
  } catch (_) {
    return null;
  }
}

async function refreshFlushedRow(tx, input) {
  const refreshed = refreshedEnvelope(input);
  if (!refreshed) return;
  await tx.run('UPDATE agent_organization_messages SET payload_json = ?, signal_blob = ? WHERE id = ?', refreshed.payloadJson, refreshed.signalBlob, input.row.id);
}

module.exports = { refreshedEnvelope, refreshFlushedRow };
