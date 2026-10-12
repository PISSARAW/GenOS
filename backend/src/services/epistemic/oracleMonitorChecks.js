'use strict';

const VERSION = 'genos.monitor-samples-postconditions/v1';
const STRATEGIES = new Set(['monitor_filter_samples', 'monitor_scan_samples']);
function outcome(status, reason, strategy) { return { schema: VERSION, status, reason, strategy }; }
function validSubject(subject) { return validMethod(subject?.method); }
function validMethod(method) { return method?.version === 1 && method.methodId === 'monitor_samples' && validParameters(method.parameters); }
function validParameters(input) {
  return typeof input?.territoryId === 'string' && Number.isFinite(input?.threshold) && validSamples(input.samples);
}
function validSamples(samples) {
  return Array.isArray(samples) && samples.length > 0 && samples.length <= 10000
    && samples.every(validSample) && new Set(samples.map(sample => sample.sourceRef)).size === samples.length;
}
function validSample(sample) {
  return Number.isFinite(sample?.value) && typeof sample.sourceRef === 'string'
    && typeof sample.observedAt === 'string' && Number.isFinite(Date.parse(sample.observedAt));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function filteredSamples(samples, threshold) {
  return samples.filter(sample => sample.value > threshold).map(({ value, observedAt, sourceRef }) => ({ value, observedAt, sourceRef }));
}
function scannedSamples(samples, threshold) {
  const anomalies = [];
  for (const sample of samples) {
    if (sample.value <= threshold) continue;
    anomalies.push({ value: sample.value, observedAt: sample.observedAt, sourceRef: sample.sourceRef });
  }
  return anomalies;
}
function checkMonitor(subject, strategy) {
  if (!STRATEGIES.has(strategy) || !validSubject(subject)) return outcome('inconclusive', 'monitor_oracle_domain_unavailable', strategy);
  const { territoryId, threshold, samples } = subject.method.parameters;
  const anomalies = strategy === 'monitor_filter_samples'
    ? filteredSamples(samples, threshold) : scannedSamples(samples, threshold);
  const refs = samples.map(sample => sample.sourceRef);
  const observedAt = new Date(Math.max(...samples.map(sample => Date.parse(sample.observedAt)))).toISOString();
  const territoryReport = { territoryId, observedAt, sourceRefs: refs };
  const digest = require('node:crypto').createHash('sha256').update(canonical({
    methodContract: subject.method, anomalies, territoryReport })).digest('hex');
  const output = subject.output;
  const criteria = { anomalies: require('node:util').isDeepStrictEqual(output?.anomalies, anomalies),
    sampleCount: output?.sampleCount === samples.length, threshold: output?.threshold === threshold,
    territoryReport: require('node:util').isDeepStrictEqual(output?.territoryReport, territoryReport),
    receipt: output?.monitorReceipt?.id === `solver://sha256:${digest}` };
  const valid = Object.values(criteria).every(Boolean);
  return { ...outcome(valid ? 'verified' : 'refuted', valid
    ? 'monitor_sample_postconditions_checked' : 'monitor_sample_postcondition_false', strategy), criteria };
}
module.exports = { VERSION, STRATEGIES, checkMonitor };
