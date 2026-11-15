'use strict';

function main(context) {
  return context.suspended.success && context.wrongWake.code === 'SURVIVAL_WAKE_EVENT_MISMATCH'
      && context.dormant.state === 'dormant' && context.wake.success && context.wake.resumed?.resumed === null
      && context.observed.state === context.expected.state && context.observed.restoredMarker === context.expected.restoredMarker
      && context.observed.communicationCount === 1 && !context.observed.inventedMessage;
}

module.exports = { main };
