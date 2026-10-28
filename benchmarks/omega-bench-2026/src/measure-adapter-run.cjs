'use strict';

function createRunMeasurement() {
  const started = performance.now();
  let excludedMs = 0;
  return {
    exclude(operation) {
      const before = performance.now();
      try {
        return operation();
      } finally {
        excludedMs += performance.now() - before;
      }
    },
    elapsedMs() {
      return Math.max(0, performance.now() - started - excludedMs);
    }
  };
}

module.exports = { createRunMeasurement };
