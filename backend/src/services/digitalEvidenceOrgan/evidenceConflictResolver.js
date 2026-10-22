'use strict';

const { canonicalDigest } = require('./deoContract');
const { canonicalValue } = require('../stateFingerprint');

const DEFAULT_CLOCK_DRIFT_TOLERANCE_MS = 1000;

function isSameLogicalIncident(a, b) {
  const sameHost = Boolean(a.subject?.host && a.subject.host === b.subject?.host);
  if (!sameHost) return false;
  const sameEventId = Boolean(a.attributes?.eventId && a.attributes.eventId === b.attributes?.eventId);
  if (!sameEventId) return false;
  const sameRecordId = Boolean(a.attributes?.recordId && a.attributes.recordId === b.attributes?.recordId);
  const sameProcessCrossArtifact = Boolean(
    a.subject?.process && a.subject.process === b.subject?.process && a.artifactId !== b.artifactId,
  );
  return sameRecordId || sameProcessCrossArtifact;
}

function buildTimestampConflict(a, b) {
  const body = canonicalValue({
    conflictType: 'contradictory_timestamps',
    host: a.subject.host,
    deltaMs: Math.abs(a.epochMs - b.epochMs),
    sides: [
      { observationId: a.observationId, artifactId: a.artifactId, occurredAt: a.occurredAt },
      { observationId: b.observationId, artifactId: b.artifactId, occurredAt: b.occurredAt },
    ],
    resolution: 'unresolved_preserved',
    synthesizedConclusion: null,
  });
  return { ...body, conflictId: `conflict:ts:${canonicalDigest(body).slice(7, 19)}` };
}

function detectTimestampContradictions(observations, toleranceMs = DEFAULT_CLOCK_DRIFT_TOLERANCE_MS) {
  const conflicts = [];
  for (let i = 0; i < observations.length; i++) {
    for (let j = i + 1; j < observations.length; j++) {
      const a = observations[i];
      const b = observations[j];
      if (isSameLogicalIncident(a, b) && Math.abs(a.epochMs - b.epochMs) > toleranceMs) {
        conflicts.push(buildTimestampConflict(a, b));
      }
    }
  }
  return conflicts;
}

function detectCausalTimeInversions(observations) {
  const conflicts = [];
  for (const obs of observations) {
    const collectedAt = obs.provenance?.payload?.collectedAt;
    if (!collectedAt) continue;
    const collectedMs = Date.parse(collectedAt);
    if (Number.isFinite(collectedMs) && obs.epochMs > collectedMs + 5000) {
      const body = canonicalValue({
        conflictType: 'temporal_inversion_occurred_after_collection',
        observationId: obs.observationId,
        artifactId: obs.artifactId,
        occurredAt: obs.occurredAt,
        collectedAt,
        resolution: 'unresolved_preserved',
        synthesizedConclusion: null,
      });
      conflicts.push({
        ...body,
        conflictId: `conflict:inv:${canonicalDigest(body).slice(7, 19)}`,
      });
    }
  }
  return conflicts;
}

function isConflictingPolicyPair(a, b) {
  const sameHost = Boolean(a.subject?.host && a.subject.host === b.subject?.host);
  const sameSetting = Boolean(a.attributes?.settingName && a.attributes.settingName === b.attributes?.settingName);
  return sameHost && sameSetting && a.attributes.state !== b.attributes.state;
}

function detectPostureContradictions(observations) {
  const conflicts = [];
  for (let i = 0; i < observations.length; i++) {
    for (let j = i + 1; j < observations.length; j++) {
      const a = observations[i];
      const b = observations[j];
      if (isConflictingPolicyPair(a, b)) {
        const body = canonicalValue({
          conflictType: 'contradictory_policy_state',
          host: a.subject.host,
          settingName: a.attributes.settingName,
          sides: [
            { observationId: a.observationId, state: a.attributes.state, occurredAt: a.occurredAt },
            { observationId: b.observationId, state: b.attributes.state, occurredAt: b.occurredAt },
          ],
          resolution: 'unresolved_preserved',
          synthesizedConclusion: null,
        });
        conflicts.push({
          ...body,
          conflictId: `conflict:pol:${canonicalDigest(body).slice(7, 19)}`,
        });
      }
    }
  }
  return conflicts;
}

function resolveEvidenceConflicts(observations = [], options = {}) {
  const toleranceMs = Number.isFinite(options.clockDriftToleranceMs)
    ? options.clockDriftToleranceMs
    : DEFAULT_CLOCK_DRIFT_TOLERANCE_MS;

  const contradictions = [
    ...detectTimestampContradictions(observations, toleranceMs),
    ...detectCausalTimeInversions(observations),
    ...detectPostureContradictions(observations),
  ];

  return Object.freeze({
    contradictionCount: contradictions.length,
    hasContradictions: contradictions.length > 0,
    epistemicStance: contradictions.length > 0 ? 'suspended_judgment' : 'consistent_observations',
    inventedConclusion: null,
    promotionBlockedByConflict: contradictions.length > 0,
    contradictions,
  });
}

module.exports = {
  DEFAULT_CLOCK_DRIFT_TOLERANCE_MS,
  resolveEvidenceConflicts,
};
