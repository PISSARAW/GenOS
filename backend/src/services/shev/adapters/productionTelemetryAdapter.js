'use strict';

const { createHash } = require('node:crypto');
const { recordObservation } = require('../observationService');

const MAX_EVENTS = 5000;

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function payloadOf(row) {
  try { return JSON.parse(row.payload_json || '{}'); } catch (_) { return null; }
}

function validCounts(values) {
  return values.every(Number.isFinite) && Number.isSafeInteger(values[0])
    && Number.isSafeInteger(values[1]) && values[1] <= values[0];
}

function parseSample(row, deploymentId) {
  const payload = payloadOf(row);
  if (!payload || payload.environment !== 'production') return null;
  if (deploymentId && payload.deploymentId !== deploymentId) return null;
  const requests = finiteNonNegative(payload.requests);
  const errors = finiteNonNegative(payload.errors);
  const latencyMsTotal = finiteNonNegative(payload.latencyMsTotal);
  if (!validCounts([requests, errors, latencyMsTotal])) return null;
  return { id: row.event_id || String(row.id), requests, errors, latencyMsTotal,
    deploymentId: payload.deploymentId || null };
}

function aggregate(samples) {
  return samples.reduce((total, sample) => ({ requests: total.requests + sample.requests,
    errors: total.errors + sample.errors,
    latencyMsTotal: total.latencyMsTotal + sample.latencyMsTotal }),
  { requests: 0, errors: 0, latencyMsTotal: 0 });
}

function classify(metrics, config) {
  if (metrics.requests < config.minRequests) return { kind: 'blind_spot',
    epistemicStatus: 'unknown', summary: 'La telemetrie de production est insuffisante.',
    evidenceRefs: [] };
  const errorRate = metrics.errors / metrics.requests;
  const averageLatencyMs = metrics.latencyMsTotal / metrics.requests;
  const breached = errorRate > config.maxErrorRate
    || averageLatencyMs > config.maxAverageLatencyMs;
  return { kind: breached ? 'degradation' : 'state', epistemicStatus: 'observed',
    summary: breached
      ? 'Un seuil SLO de production est depasse.'
      : 'Les mesures observees respectent les seuils SLO delegues.',
    errorRate, averageLatencyMs };
}

async function rowsInWindow(db, input, nowMs) {
  const cutoff = new Date(nowMs - input.windowMs).toISOString();
  return db.all(`SELECT id, event_id, payload_json, created_at FROM telemetry_events
    WHERE project_id = ? AND event_type = ? AND datetime(created_at) >= datetime(?)
    ORDER BY id DESC LIMIT ?`, [input.projectId, input.eventType, cutoff, MAX_EVENTS]);
}

function observationIdentity(input, result, samples) {
  return digest([input.projectId, input.dimension, input.eventType, input.windowMs,
    input.maxErrorRate, input.maxAverageLatencyMs, input.minRequests,
    input.deploymentId, result.kind, samples.map(sample => sample.id).sort()]);
}

async function inspectProductionTelemetry(db, input) {
  const nowMs = input.nowMs ?? Date.now();
  const rows = await rowsInWindow(db, input, nowMs);
  const samples = rows.map(row => parseSample(row, input.deploymentId)).filter(Boolean);
  const metrics = aggregate(samples);
  const result = classify(metrics, input);
  const evidenceRefs = result.epistemicStatus === 'observed'
    ? samples.slice(0, 20).map(sample => `telemetry-event:${sample.id}`) : [];
  const identity = observationIdentity(input, result, samples);
  const observation = await recordObservation(db, { id: `production_telemetry_${identity}`,
    projectId: input.projectId, domain: 'production-runtime', dimension: input.dimension,
    source: `production-telemetry:${digest([input.eventType, input.deploymentId])}`,
    observedAt: new Date(nowMs).toISOString(), kind: result.kind,
    epistemicStatus: result.epistemicStatus, summary: result.summary, evidenceRefs });
  await persistWindow(db, { observation, metrics, result, input, evidenceRefs });
  return observation;
}

async function persistWindow(db, context) {
  const metrics = { ...context.metrics,
    errorRate: context.result?.errorRate ?? (context.metrics.requests
      ? context.metrics.errors / context.metrics.requests : null),
    averageLatencyMs: context.result?.averageLatencyMs ?? (context.metrics.requests
      ? context.metrics.latencyMsTotal / context.metrics.requests : null) };
  const policy = { eventType: context.input.eventType, windowMs: context.input.windowMs,
    maxErrorRate: context.input.maxErrorRate,
    maxAverageLatencyMs: context.input.maxAverageLatencyMs,
    minRequests: context.input.minRequests, deploymentId: context.input.deploymentId || null };
  const evidenceDigest = digest({ metrics, policy, evidenceRefs: context.evidenceRefs });
  await db.run(`INSERT OR IGNORE INTO production_telemetry_observations
    (project_id,observation_id,metrics_json,policy_json,evidence_digest)
    VALUES(?,?,?,?,?)`, [context.input.projectId, context.observation.id,
    JSON.stringify(metrics), JSON.stringify(policy), evidenceDigest]);
  const stored = await db.get(`SELECT evidence_digest FROM production_telemetry_observations
    WHERE project_id = ? AND observation_id = ?`,
  [context.input.projectId, context.observation.id]);
  if (stored.evidence_digest !== evidenceDigest) throw new Error('Production telemetry window idempotency conflict.');
}

module.exports = { inspectProductionTelemetry, parseSample, aggregate, classify };
