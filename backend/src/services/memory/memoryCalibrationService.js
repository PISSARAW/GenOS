'use strict';

const profile = require('../../../../shared/memoryCalibration.json');

const MIN_CLASS_SAMPLES = 10;
const MIN_BALANCED_ACCURACY = 0.65;

function threshold(name) {
  const value = profile.thresholds[name];
  if (!Number.isFinite(value)) throw new Error(`Unknown memory calibration threshold: ${name}`);
  return value;
}

function runtimeProfile() {
  return {
    schema: profile.schema,
    version: profile.version,
    status: profile.status,
    thresholds: { ...profile.thresholds },
    evidence: { ...profile.evidence }
  };
}

function normalizeSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return samples.filter((item) => item && Number.isFinite(item.score)
    && item.score >= 0 && item.score <= 1 && typeof item.helpful === 'boolean');
}

function confusion(samples, candidate) {
  const counts = { tp: 0, tn: 0, fp: 0, fn: 0 };
  for (const sample of samples) {
    const selected = sample.score >= candidate;
    if (selected && sample.helpful) counts.tp += 1;
    else if (selected) counts.fp += 1;
    else if (sample.helpful) counts.fn += 1;
    else counts.tn += 1;
  }
  return counts;
}

function metricValue(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function metrics(samples, candidate) {
  const counts = confusion(samples, candidate);
  const recall = metricValue(counts.tp, counts.tp + counts.fn);
  const specificity = metricValue(counts.tn, counts.tn + counts.fp);
  const precision = metricValue(counts.tp, counts.tp + counts.fp);
  return { threshold: candidate, balancedAccuracy: (recall + specificity) / 2,
    precision, recall, ...counts };
}

function candidates(samples, baseline) {
  const values = samples.map((sample) => sample.score);
  return [...new Set([0, baseline, 1, ...values])].sort((left, right) => left - right);
}

function better(left, right) {
  if (!right || left.balancedAccuracy > right.balancedAccuracy) return true;
  if (left.balancedAccuracy < right.balancedAccuracy) return false;
  if (left.precision > right.precision) return true;
  if (left.precision < right.precision) return false;
  return left.threshold > right.threshold;
}

function calibrationStatus(samples, best) {
  const positives = samples.filter((item) => item.helpful).length;
  const negatives = samples.length - positives;
  const qualified = positives >= MIN_CLASS_SAMPLES && negatives >= MIN_CLASS_SAMPLES
    && best.balancedAccuracy >= MIN_BALANCED_ACCURACY;
  return { status: qualified ? 'qualified' : 'provisional', qualified, positives, negatives };
}

function calibrateThreshold(input = {}) {
  const samples = normalizeSamples(input.samples);
  const baseline = Number.isFinite(input.baseline) ? input.baseline : 0.5;
  let best = null;
  for (const candidate of candidates(samples, baseline)) {
    const observed = metrics(samples, candidate);
    if (better(observed, best)) best = observed;
  }
  best = best || metrics([], baseline);
  const qualification = calibrationStatus(samples, best);
  return { ...qualification, sampleCount: samples.length, baseline: metrics(samples, baseline), best };
}

module.exports = { threshold, runtimeProfile, calibrateThreshold, metrics,
  MIN_CLASS_SAMPLES, MIN_BALANCED_ACCURACY };
