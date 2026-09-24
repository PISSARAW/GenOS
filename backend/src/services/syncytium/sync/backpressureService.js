'use strict';

function assess(telemetry = {}) {
  const queueDepth = nonNegative(telemetry.queueDepth);
  const consumerLagMs = nonNegative(telemetry.consumerLagMs);
  const opsProducedPerSec = nonNegative(telemetry.opsProducedPerSec);
  const opsAppliedPerSec = nonNegative(telemetry.opsAppliedPerSec);
  const overloaded = queueDepth >= 10000 || consumerLagMs >= 30000;
  const pressured = queueDepth >= 1000 || consumerLagMs >= 5000 || opsProducedPerSec > opsAppliedPerSec * 2;
  return {
    status: overloaded ? 'OVERLOADED' : pressured ? 'PRESSURED' : 'NORMAL',
    queueDepth,
    consumerLagMs,
    opsProducedPerSec,
    opsAppliedPerSec,
    action: overloaded ? 'SLOW_PRODUCER' : pressured ? 'BATCH_LOW_PRIORITY' : 'PASS'
  };
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

module.exports = { assess };
