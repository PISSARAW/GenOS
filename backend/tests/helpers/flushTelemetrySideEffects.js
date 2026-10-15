'use strict';

async function flushTelemetrySideEffects() {
  const observer = require('../../src/services/telemetryObserver');
  await observer.flush(15000);
  await Promise.allSettled([...observer.deferredSideEffects]);
  await observer.flush(15000);
  await Promise.allSettled([...observer.deferredSideEffects]);
}

module.exports = { flushTelemetrySideEffects };
