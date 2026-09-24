'use strict';

const { EDGE_RELATIONS, EDGE_STATES } = require('../constants');
const { objectValue, textValue, enumValue, numberValue, objectOrEmpty, isoDateOrNull } = require('./validation');

function normalizeTrailState(value) {
  const trail = objectOrEmpty(value, 'trailState');
  return {
    positive: numberValue(trail.positive, 'trailState.positive', { maximum: 100 }),
    negative: numberValue(trail.negative, 'trailState.negative', { maximum: 100 }),
    updatedAt: isoDateOrNull(trail.updatedAt, 'trailState.updatedAt')
  };
}

function normalizeCapabilityEdge(value) {
  const edge = objectValue(value, 'CapabilityEdge');
  const from = textValue(edge.from, 'from');
  const to = textValue(edge.to, 'to');
  if (from === to) throw Object.assign(new Error('Invalid Rhizome edge: self-edges are not allowed'), { code: 'RHIZOME_CONTRACT_INVALID', field: 'to' });
  return {
    edgeId: textValue(edge.edgeId, 'edgeId'),
    from,
    to,
    relation: enumValue(edge.relation, { allowed: EDGE_RELATIONS, field: 'relation' }),
    compatibility: numberValue(edge.compatibility, 'compatibility', { maximum: 1, fallback: 1 }),
    conductivity: numberValue(edge.conductivity, 'conductivity', { fallback: 1 }),
    cost: numberValue(edge.cost, 'cost', { fallback: 0 }),
    latency: numberValue(edge.latency, 'latency', { fallback: 0 }),
    reliability: numberValue(edge.reliability, 'reliability', { maximum: 1, fallback: 0.5 }),
    successRate: numberValue(edge.successRate, 'successRate', { maximum: 1, fallback: 0 }),
    evidenceQuality: numberValue(edge.evidenceQuality, 'evidenceQuality', { maximum: 1, fallback: 0 }),
    trailState: normalizeTrailState(edge.trailState),
    lastUsed: isoDateOrNull(edge.lastUsed, 'lastUsed'),
    status: enumValue(edge.status, { allowed: EDGE_STATES, field: 'status', fallback: 'ACTIVE' })
  };
}

module.exports = { normalizeCapabilityEdge };
