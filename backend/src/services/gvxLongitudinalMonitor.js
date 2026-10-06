'use strict';

const { appendEvent } = require('./gvxDevelopmentLedger');
const { monitorSomaticApplication } = require('./gvxSomaticMonitor');

function validate(input) {
  if (!Array.isArray(input.windows) || input.windows.length < 2) throw new Error('independent-monitor-windows-required');
  const ids = new Set(input.windows.map((window) => window.observationId));
  const contexts = new Set(input.windows.map((window) => window.contextHash));
  if (ids.size !== input.windows.length || input.windows.some((window) => !window.observationId || !window.contextHash)) throw new Error('longitudinal-window-identity-invalid');
  if (contexts.size < 2) throw new Error('longitudinal-context-diversity-required');
}

function summarize(results, windows, minimumStableWindows) {
  const scores = results.map((item) => item.assessment.status === 'recommend_somatic_trial' ? 1
    : item.assessment.status === 'no_measured_gain' ? 0 : null).filter(Number.isFinite);
  const regressions = results.filter((item) => item.assessment.status === 'reject').length;
  const positive = results.filter((item) => item.assessment.status === 'recommend_somatic_trial').length;
  const positiveWindowRate = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const variance = scores.length ? scores.reduce((sum, value) => sum + (value - positiveWindowRate) ** 2, 0) / scores.length : null;
  const complete = results.every((item) => ['recommend_somatic_trial', 'no_measured_gain'].includes(item.assessment.status));
  const stable = complete && regressions === 0 && positive >= minimumStableWindows;
  const rollbackFailed = results.some((item) => item.rollback?.payload?.result?.status === 'failed');
  return { windows: windows.length, positiveWindowRate, positiveWindowRateVariance: variance,
    metricConfidenceIntervals: summarizeMetricDeltas(results, 0.95), confidenceLevel: 0.95,
    regressionRate: regressions / windows.length, environmentDiversity: new Set(windows.map((window) => window.contextHash)).size,
    stable, maturity: rollbackFailed ? 'rollback_failed' : stable ? 'mature_somatic_eligible' : regressions ? 'rollback_recorded' : 'monitoring' };
}

function summarizeMetricDeltas(results, confidenceLevel) {
  const grouped = new Map();
  for (const result of results) for (const metric of result.assessment.metrics || []) {
    if (!Number.isFinite(metric.delta)) continue;
    const values = grouped.get(metric.metric) || [];
    values.push(metric.delta);
    grouped.set(metric.metric, values);
  }
  return Object.fromEntries([...grouped].map(([metric, values]) => [metric, interval(values, confidenceLevel)]));
}

function criticalValue(sampleCount, confidenceLevel) {
  const tables = { 0.9: [6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812],
    0.95: [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228],
    0.99: [63.657, 9.925, 5.841, 4.604, 4.032, 3.707, 3.499, 3.355, 3.25, 3.169] };
  const table = tables[confidenceLevel];
  if (!table) throw new Error('unsupported-confidence-level');
  const df = sampleCount - 1;
  return table[Math.min(df, table.length) - 1];
}

function interval(values, confidenceLevel) {
  if (values.length < 2) return { samples: values.length, mean: values[0] ?? null, lower: null, upper: null, status: 'insufficient_samples' };
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  const margin = criticalValue(values.length, confidenceLevel) * Math.sqrt(variance / values.length);
  return { samples: values.length, mean: avg, standardError: Math.sqrt(variance / values.length),
    lower: avg - margin, upper: avg + margin, status: 'estimated' };
}

async function monitor(db, input) {
  validate(input);
  const results = [];
  for (const window of input.windows) {
    results.push(await monitorSomaticApplication(db, { ...input, ...window }));
    if (results.at(-1).rollback) break;
  }
  const summary = summarize(results, input.windows.slice(0, results.length), input.minimumStableWindows || 3);
  const event = await appendEvent(db, { ...input.scope, entityId: input.entityId,
    type: 'evidence_attached', parentHash: input.parentHash, candidateHash: input.candidateHash,
    payload: { kind: 'gvx_longitudinal_monitor', applicationId: input.applicationId, summary,
      observationIds: input.windows.slice(0, results.length).map((window) => window.observationId) } });
  return { ...summary, eventId: event.id, results };
}

module.exports = { monitor, validate, summarize, interval, summarizeMetricDeltas };
