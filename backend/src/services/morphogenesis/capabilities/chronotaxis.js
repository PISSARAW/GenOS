'use strict';

const PHASE_STEP = (3 - Math.sqrt(5)) / 2;

function phase(index, offset = 0) {
  if (!Number.isInteger(index) || index < 0 || !Number.isFinite(offset)) {
    throw new Error('Invalid phase index or offset');
  }
  return ((offset + index * PHASE_STEP) % 1 + 1) % 1;
}

function timing(spec) {
  const periodMs = Number(spec.periodMs);
  const anchorMs = Number(spec.anchorMs);
  const minimumSpacingMs = Number(spec.minimumSpacingMs || 0);
  const maximumLatencyMs = Number(spec.maximumLatencyMs || periodMs);
  if (![periodMs, anchorMs, minimumSpacingMs, maximumLatencyMs].every(Number.isFinite)
    || periodMs <= 0 || minimumSpacingMs < 0 || maximumLatencyMs <= 0
    || maximumLatencyMs > periodMs || minimumSpacingMs >= periodMs) {
    throw new Error('Invalid chronotaxis timing contract');
  }
  return { periodMs, anchorMs, minimumSpacingMs, maximumLatencyMs };
}

function nextObservation(spec, nowMs) {
  const { periodMs, anchorMs, minimumSpacingMs, maximumLatencyMs } = timing(spec);
  let index = Math.max(Number(spec.index || 0), Math.floor((nowMs - anchorMs) / periodMs));
  if (!Number.isInteger(index) || index < 0) index = 0;
  for (let skipped = 0; skipped < 3; skipped++, index++) {
    const windowStart = anchorMs + index * periodMs;
    const scheduled = windowStart + Math.min(periodMs * phase(index, Number(spec.offset || 0)), maximumLatencyMs);
    if (scheduled >= nowMs + minimumSpacingMs) {
      return { index, scheduledAt: new Date(scheduled).toISOString(), phase: phase(index, Number(spec.offset || 0)) };
    }
  }
  throw new Error('No feasible observation window');
}

function coverage(observations, input) {
  const { periodMs, anchorMs, bins = 12 } = input;
  if (!Number.isInteger(bins) || bins < 2 || periodMs <= 0) throw new Error('Invalid coverage contract');
  const occupied = new Set();
  for (const item of observations || []) {
    if (item.status !== 'OBSERVED') continue;
    const ms = Date.parse(item.observedAt);
    if (Number.isFinite(ms)) occupied.add(Math.floor((((ms - anchorMs) % periodMs + periodMs) % periodMs) / periodMs * bins));
  }
  return { observedBins: [...occupied].sort((a, b) => a - b), covered: occupied.size, total: bins };
}

module.exports = { PHASE_STEP, phase, nextObservation, coverage };
