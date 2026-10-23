'use strict';

const DEFAULT_INTERVAL_MS = 60000;

function startWorkerHeartbeat(renew, options = {}) {
  if (typeof renew !== 'function') throw new TypeError('worker heartbeat requires a renewal function');
  const intervalMs = Number.isFinite(Number(options.intervalMs)) && Number(options.intervalMs) > 0
    ? Number(options.intervalMs) : DEFAULT_INTERVAL_MS;
  let stopped = false;
  let failure = null;
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    if (stopped || failure) return;
    pending = pending.then(() => renew()).catch((error) => { failure = error; });
  }, intervalMs);
  timer.unref?.();
  return {
    async flush() {
      await pending;
      if (failure) throw failure;
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
      if (failure) throw failure;
    }
  };
}

module.exports = { startWorkerHeartbeat, DEFAULT_INTERVAL_MS };
