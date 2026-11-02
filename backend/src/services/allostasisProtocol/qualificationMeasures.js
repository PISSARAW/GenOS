'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const c = require('./qualificationConfig');

function valueOf(binding, variables) {
  if (!variables || !Object.hasOwn(variables, binding.field)) return null;
  const value = variables[binding.field];
  if (binding.kind === 'integer') return Number.isSafeInteger(value) && value >= 0 ? { value, quantization: null } : null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  const scaled = value * 1000000;
  const lower = Math.floor(scaled);
  const upper = Math.ceil(scaled);
  return { value: lower, quantization: { method: 'floor/ceil', scale: 1000000, rawValue: value, lower, upper } };
}

function sampleReasons(level, config, current) {
  const reasons = [];
  if (level.status !== 'measured') reasons.push('native_state_unavailable');
  const sampled = level.sampledAt;
  if (!Number.isSafeInteger(sampled) || !Number.isFinite(new Date(sampled).getTime())) return [...reasons, 'native_timestamp_unavailable'];
  if (sampled > current) reasons.push('native_state_from_future');
  if (current - sampled >= config.maxAgeMs) reasons.push('native_state_stale');
  return reasons;
}

function measurements(input) {
  const { bindings, snapshot, fresh } = input;
  const reasons = [];
  const values = bindings.map(binding => {
    const reading = fresh ? valueOf(binding, snapshot.scopeState.variables) : null;
    if (!reading) reasons.push(`metric_unavailable:${binding.metricId}`);
    return { metricId: binding.metricId, unit: binding.unit, value: reading?.value ?? null,
      uncertainty: { kind: 'unknown' }, quantization: reading?.quantization ?? null,
      provenance: { sourceId: `${snapshot.service}:${snapshot.sourceAgentId}:${snapshot.level}:${binding.field}`,
        sourceDigest: digest({ snapshot, binding }), evidenceRefs: snapshot.scopeState.evidenceRefs,
        method: binding.kind === 'ratio' ? 'native_ratio_floor_ceil_ppm' : 'native_integer_exact_no_conversion' } };
  });
  return { values, reasons };
}

function makeReport(input) {
  const { config, snapshot, current, reportId } = input;
  const reasons = sampleReasons(snapshot.scopeState, config, current);
  const bindings = config.metricBindings.filter(item => item.level === snapshot.level);
  if (!bindings.length) reasons.push('metric_mapping_unavailable');
  const measured = measurements({ bindings, snapshot, fresh: reasons.length === 0 });
  reasons.push(...measured.reasons);
  const sampled = snapshot.scopeState.sampledAt;
  const hasTime = Number.isSafeInteger(sampled) && Number.isFinite(new Date(sampled).getTime());
  const until = hasTime ? sampled + config.maxAgeMs : null;
  return { reportId, status: reasons.length ? 'unavailable' : 'available', scope: config.scope,
    missionId: config.missionId, subject: c.subject(config, snapshot.level),
    observedAt: hasTime ? c.iso(sampled) : null, validUntil: hasTime ? c.iso(until) : null,
    measurements: measured.values, nativeSnapshot: snapshot, reasons: [...new Set(reasons)] };
}

module.exports = { valueOf, sampleReasons, measurements, makeReport };
