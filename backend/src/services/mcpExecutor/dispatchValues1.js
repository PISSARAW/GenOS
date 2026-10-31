'use strict';

function executeConfiguredTransportValue1(__genosValueScope1) {
  return __genosValueScope1.normalizedToolName === 'genos_replay' && __genosValueScope1.scopedReplayAllowed === true
    && !(0, __genosValueScope1.hasConfiguredEndpoint)() && (0, __genosValueScope1.require)('./config').scopedWorkerReplayLeaseOpen();
}

module.exports = { executeConfiguredTransportValue1 };
