'use strict';

function executionLeaseValue1(__genosValueScope1) {
  return __genosValueScope1.normalized === 'genos_replay' && __genosValueScope1.binding?.status === 'authorized'
    && __genosValueScope1.sealed.includes('genos_replay') && (0, __genosValueScope1.scopedWorkerReplayLeaseOpen)()
    && (0, __genosValueScope1.directToolGloballyEnabled)('genos_replay');
}

module.exports = { executionLeaseValue1 };
