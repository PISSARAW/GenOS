'use strict';

const {
  RETENTION_TIERS,
  deoError,
  sha256Digest,
  parseIsoTimestamp,
} = require('./deoContract');
const { canonicalValue } = require('../stateFingerprint');

const TIER_DURATIONS_MS = Object.freeze({
  ephemeral: 24 * 3600 * 1000,
  short_term: 7 * 24 * 3600 * 1000,
  standard: 30 * 24 * 3600 * 1000,
  forensic_hold: 365 * 24 * 3600 * 1000,
});

function pseudonymizeValue(value, salt = 'genos-deo-minimization-v1') {
  if (!value) return null;
  return `redacted:${sha256Digest(`${salt}:${value}`).slice(7, 23)}`;
}

function redactEventData(eventData, redactKeys, salt) {
  if (!eventData || typeof eventData !== 'object') return eventData;
  const cleaned = {};
  for (const [k, v] of Object.entries(eventData)) {
    cleaned[k] = redactKeys.has(k) ? pseudonymizeValue(v, salt) : v;
  }
  return cleaned;
}

function minimizeObservation(obs, minimizationPolicy = {}) {
  if (!minimizationPolicy.enabled) return obs;
  const salt = minimizationPolicy.salt ?? 'genos-deo-minimization-v1';
  const redactUsers = minimizationPolicy.redactUsers !== false;
  const redactKeys = new Set(minimizationPolicy.redactEventDataKeys ?? ['IpAddress', 'WorkstationName']);

  const user = obs.subject?.user;
  const subject = {
    ...obs.subject,
    user: redactUsers ? pseudonymizeValue(user, salt) : user,
  };

  const eventData = redactEventData(obs.attributes?.eventData, redactKeys, salt);
  const attributes = eventData ? { ...obs.attributes, eventData } : obs.attributes;

  return Object.freeze(canonicalValue({
    ...obs,
    subject,
    attributes,
    minimized: true,
    originalObservationHash: obs.observationHash,
  }));
}

function isObservationRevoked(obs, revocationSets) {
  const collectorId = obs.provenance?.payload?.collectorId;
  return revocationSets.artifacts.has(obs.artifactId)
    || revocationSets.observations.has(obs.observationId)
    || Boolean(collectorId && revocationSets.collectors.has(collectorId));
}

function buildRevocationSets(policy) {
  return {
    artifacts: new Set(policy.revokedArtifactIds ?? []),
    observations: new Set(policy.revokedObservationIds ?? []),
    collectors: new Set(policy.revokedCollectors ?? []),
  };
}

function classifyObservationRetention(obs, context) {
  if (isObservationRevoked(obs, context.revocationSets)) {
    context.revoked.push({
      observationId: obs.observationId,
      artifactId: obs.artifactId,
      observationHash: obs.observationHash,
      reason: 'explicit_revocation',
      revokedAt: context.nowIso,
    });
    return;
  }
  const expired = context.tier !== 'forensic_hold' && (context.nowMs - obs.epochMs > context.maxAgeMs);
  if (expired) {
    context.purgedExpired.push({
      observationId: obs.observationId,
      artifactId: obs.artifactId,
      occurredAt: obs.occurredAt,
      reason: 'retention_ttl_expired',
    });
    return;
  }
  context.retained.push(minimizeObservation(obs, context.minimization));
}

function applyEvidenceRetention(observations = [], policy = {}) {
  const tier = policy.tier ?? 'standard';
  if (!RETENTION_TIERS.includes(tier)) {
    throw deoError('DEO_RETENTION_TIER_INVALID', `Unknown retention tier '${tier}'.`);
  }
  const nowMs = policy.now ? parseIsoTimestamp(policy.now).epochMs : Date.now();
  const maxAgeMs = Number.isFinite(policy.maxAgeMs) ? policy.maxAgeMs : TIER_DURATIONS_MS[tier];
  const context = {
    tier,
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    maxAgeMs,
    minimization: policy.minimization ?? {},
    revocationSets: buildRevocationSets(policy),
    retained: [],
    purgedExpired: [],
    revoked: [],
  };

  for (const obs of observations) {
    classifyObservationRetention(obs, context);
  }

  return Object.freeze({
    tier,
    maxAgeMs,
    evaluatedAt: context.nowIso,
    retained: context.retained,
    retainedCount: context.retained.length,
    purgedExpired: context.purgedExpired,
    purgedCount: context.purgedExpired.length,
    revoked: context.revoked,
    revokedCount: context.revoked.length,
  });
}

module.exports = {
  TIER_DURATIONS_MS,
  pseudonymizeValue,
  minimizeObservation,
  applyEvidenceRetention,
};
