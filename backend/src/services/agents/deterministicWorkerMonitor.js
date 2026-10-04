'use strict';

const { createHash } = require('node:crypto');

function monitorError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_MONITOR_INPUT_INVALID' });
}

function validSample(sample) {
  return Number.isFinite(sample?.value) && typeof sample.sourceRef === 'string'
    && sample.sourceRef.trim().length > 0 && sample.sourceRef.length <= 256
    && typeof sample.observedAt === 'string' && Number.isFinite(Date.parse(sample.observedAt));
}

function assertMonitorInput(methodContract) {
  const input = methodContract?.parameters;
  if (methodContract?.version !== 1 || methodContract.methodId !== 'monitor_samples'
    || !validWindow(input)) {
    throw monitorError('Monitor requires a bounded, referenced sample window and finite threshold.');
  }
  if (new Set(input.samples.map((sample) => sample.sourceRef)).size !== input.samples.length) {
    throw monitorError('Monitor sample references must be unique.');
  }
  return true;
}

function validWindow(input) {
  return typeof input?.territoryId === 'string' && Boolean(input.territoryId.trim())
    && input.territoryId.length <= 128 && Number.isFinite(input.threshold)
    && Array.isArray(input.samples) && input.samples.length > 0 && input.samples.length <= 10000
    && input.samples.every(validSample);
}

function runMonitor(methodContract) {
  assertMonitorInput(methodContract);
  const { territoryId, threshold, samples } = methodContract.parameters;
  const anomalies = samples.filter((sample) => sample.value > threshold)
    .map((sample) => ({ value: sample.value, observedAt: sample.observedAt,
      sourceRef: sample.sourceRef }));
  const territoryReport = { territoryId,
    observedAt: new Date(Math.max(...samples.map((sample) => Date.parse(sample.observedAt)))).toISOString(),
    sourceRefs: samples.map((sample) => sample.sourceRef) };
  const digest = createHash('sha256').update(JSON.stringify({ methodContract, anomalies, territoryReport })).digest('hex');
  return { threshold, sampleCount: samples.length, anomalies, territoryReport,
    monitorReceipt: { id: `solver://sha256:${digest}` } };
}

module.exports = { assertMonitorInput, runMonitor };
