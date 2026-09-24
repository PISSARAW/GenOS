'use strict';

const DEFAULT_THRESHOLDS = { recruitBelow: 0.5, throttleAt: 0.85, shrinkAbove: 1 };

function assessOccupancy(occupancy, capacity, input = {}) {
  const thresholds = resolveThresholds(input);
  if (capacity === null) return { pressure: null, action: 'capacity_unknown', thresholds };
  if (capacity === 0) return { pressure: occupancy ? null : 0, action: occupancy ? 'shrink_or_migrate' : 'no_capacity', thresholds };
  const pressure = occupancy / capacity;
  return { pressure, action: pressureAction(pressure, thresholds), thresholds };
}

function resolveThresholds(input) {
  const thresholds = {
    recruitBelow: input.recruitBelow ?? DEFAULT_THRESHOLDS.recruitBelow,
    throttleAt: input.throttleAt ?? DEFAULT_THRESHOLDS.throttleAt,
    shrinkAbove: input.shrinkAbove ?? DEFAULT_THRESHOLDS.shrinkAbove
  };
  if (!Object.values(thresholds).every(Number.isFinite)
    || thresholds.recruitBelow < 0
    || thresholds.recruitBelow > thresholds.throttleAt
    || thresholds.throttleAt > thresholds.shrinkAbove) {
    throw Object.assign(new Error('Niche pressure thresholds must be finite and ordered.'), { code: 'BIOME_PRESSURE_THRESHOLDS_INVALID' });
  }
  return thresholds;
}

function pressureAction(pressure, thresholds) {
  if (pressure < thresholds.recruitBelow) return 'recruit';
  if (pressure < thresholds.throttleAt) return 'maintain';
  if (pressure <= thresholds.shrinkAbove) return 'throttle';
  return 'shrink_or_migrate';
}

module.exports = { assessOccupancy, DEFAULT_THRESHOLDS };
