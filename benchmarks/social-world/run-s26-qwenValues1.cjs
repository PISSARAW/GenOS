'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.suspended.success && __genosValueScope1.wrongWake.code === 'SURVIVAL_WAKE_EVENT_MISMATCH'
      && __genosValueScope1.dormant.state === 'dormant' && __genosValueScope1.wake.success && __genosValueScope1.wake.resumed?.resumed === null
      && __genosValueScope1.observed.state === __genosValueScope1.expected.state && __genosValueScope1.observed.restoredMarker === __genosValueScope1.expected.restoredMarker
      && __genosValueScope1.observed.communicationCount === 1 && !__genosValueScope1.observed.inventedMessage;
}

module.exports = { mainValue1 };
