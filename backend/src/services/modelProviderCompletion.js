'use strict';

function completionReason(payload) {
  const reason = payload.done_reason || payload.stop_reason || payload.choices?.[0]?.finish_reason
    || payload.candidates?.[0]?.finishReason;
  if (['stop', 'end_turn', 'stop_sequence', 'STOP'].includes(reason)) return 'stop';
  if (['length', 'max_tokens', 'MAX_TOKENS'].includes(reason)) return 'length';
  return reason || null;
}

module.exports = { completionReason };
