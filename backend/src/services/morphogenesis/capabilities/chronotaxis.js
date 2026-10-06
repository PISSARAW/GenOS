'use strict';

const PHASE_STEP = (3 - Math.sqrt(5)) / 2;

function phase(index, offset = 0) {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isFinite(offset)) {
    throw new Error('Invalid phase index or offset');
  }
  return ((offset + index * PHASE_STEP) % 1 + 1) % 1;
}

function timing(spec) {
  const periodMs = Number(spec.periodMs);
  const anchorMs = Number(spec.anchorMs);
  const minimumSpacingMs = Number(spec.minimumSpacingMs || 0);
  const maximumLatencyMs = Number(spec.maximumLatencyMs ?? periodMs);
  if (![periodMs, anchorMs, minimumSpacingMs, maximumLatencyMs].every(Number.isFinite)
    || periodMs <= 0 || minimumSpacingMs < 0 || maximumLatencyMs <= 0
    || maximumLatencyMs > periodMs || minimumSpacingMs >= periodMs) {
    throw new Error('Invalid chronotaxis timing contract');
  }
  return { periodMs, anchorMs, minimumSpacingMs, maximumLatencyMs };
}

function nextObservation(spec, nowMs) {
  const { periodMs, anchorMs, minimumSpacingMs, maximumLatencyMs } = timing(spec);
  if (!Number.isFinite(nowMs)) throw new Error('Invalid scheduler time');
  const earliest = Math.max(nowMs, Number(spec.lastObservedMs ?? nowMs) + minimumSpacingMs);
  let index = Math.max(Number(spec.index || 0), Math.floor((nowMs - anchorMs) / periodMs));
  if (!Number.isInteger(index) || index < 0) index = 0;
  for (let skipped = 0; skipped < 3; skipped++, index++) {
    const windowStart = anchorMs + index * periodMs;
    const selectedPhase = feedbackPhase(spec, index);
    const scheduled = windowStart + Math.min(periodMs * selectedPhase, maximumLatencyMs);
    if (scheduled >= earliest) {
      return { index, scheduledAt: new Date(scheduled).toISOString(), phase: selectedPhase };
    }
  }
  throw new Error('No feasible observation window');
}

function feedbackPhase(spec, index) {
  const initial = phase(index, Number(spec.offset || 0));
  const counts = spec.binCounts;
  if (!Array.isArray(counts) || counts.length < 2) return initial;
  if (counts.length > 512 || counts.some((n) => !Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid phase coverage');
  const ceiling = Number(spec.maximumLatencyMs ?? spec.periodMs) / spec.periodMs;
  const bins = counts.map((count, bin) => ({ count, value: (bin + 0.5) / counts.length }))
    .filter((item) => item.value <= ceiling);
  if (!bins.length) return initial;
  bins.sort((a, b) => a.count - b.count || circularDistance(a.value, initial) - circularDistance(b.value, initial));
  return bins[0].value;
}

function circularDistance(left, right) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 1 - distance);
}

function windowBounds(spec, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid observation window');
  const { periodMs, anchorMs } = timing(spec);
  const startMs = anchorMs + index * periodMs;
  return { startMs, endMs: startMs + periodMs };
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

module.exports = { PHASE_STEP, phase, nextObservation, windowBounds, coverage, feedbackPhase };
