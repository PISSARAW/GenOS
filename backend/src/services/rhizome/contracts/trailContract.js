'use strict';

const { objectValue, textValue, enumValue, numberValue, listValue } = require('./validation');

const TRAIL_KINDS = Object.freeze([
  'CAPABILITY_FOUND', 'ROUTE_SUCCESS', 'ROUTE_FAILURE', 'DEAD_END', 'HIGH_COST', 'HIGH_LATENCY',
  'VERIFIED_RESULT', 'SECURITY_RISK', 'GAP_DETECTED', 'BRIDGE_AVAILABLE'
]);

function normalizeTrail(value) {
  const trail = objectValue(value, 'RhizomeTrail');
  return {
    trailId: textValue(trail.trailId, 'trailId'),
    locus: textValue(trail.locus, 'locus'),
    kind: enumValue(trail.kind, { allowed: TRAIL_KINDS, field: 'kind' }),
    capability: trail.capability == null ? null : textValue(trail.capability, 'capability'),
    source: textValue(trail.source, 'source'),
    evidenceRefs: listValue(trail.evidenceRefs, 'evidenceRefs'),
    intensity: numberValue(trail.intensity, 'intensity', { minimum: -100, maximum: 100 }),
    confidence: numberValue(trail.confidence, 'confidence', { maximum: 1, fallback: 0.5 }),
    createdAt: textValue(trail.createdAt, 'createdAt'),
    halfLifeMs: numberValue(trail.halfLifeMs, 'halfLifeMs', { minimum: 1 }),
    scope: enumValue(trail.scope, { allowed: ['mission', 'workspace', 'persistent'], field: 'scope', fallback: 'mission' })
  };
}

module.exports = { TRAIL_KINDS, normalizeTrail };
