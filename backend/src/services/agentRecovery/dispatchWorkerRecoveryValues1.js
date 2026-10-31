'use strict';

function dispatchWorkerRecoveryValue1(__genosValueScope1) {
  return __genosValueScope1.recovery.durableItem ? (0, __genosValueScope1.setInterval)(() => {
    __genosValueScope1.durableQueue.renew(__genosValueScope1.recovery.durableItem).catch(() => {});
  }, 30000) : null;
}

module.exports = { dispatchWorkerRecoveryValue1 };
