'use strict';

function dispatchWorkerRecovery(context) {
  return context.recovery.durableItem ? context.setInterval(() => {
    context.durableQueue.renew(context.recovery.durableItem).catch(() => {});
  }, 30000) : null;
}

module.exports = { dispatchWorkerRecovery };
