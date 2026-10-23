'use strict';

function start(input = {}) {
  if (typeof input.renew !== 'function') throw new TypeError('Identity lease renewal callback is required.');
  const intervalMs = Math.max(25, Number(input.intervalMs) || 60000);
  let stopped = false;
  let inFlight = null;
  let lastError = null;

  const pulse = () => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(input.renew)
      .then(() => { lastError = null; }, error => { lastError = error; })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  const timer = setInterval(() => { void pulse(); }, intervalMs);
  timer.unref?.();

  return {
    pulse,
    assertHealthy() { if (lastError) throw lastError; },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    }
  };
}

module.exports = { start };
