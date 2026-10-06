'use strict';

const decay = require('./trailDecayService');

function evaporate(session, now = Date.now()) {
  session.edges = session.edges.map(edge => {
    const timestamp = Date.parse(edge.trailState.updatedAt);
    if (!Number.isFinite(timestamp)) return edge;
    const common = { lastUpdatedMs: timestamp, confidence: edge.evidenceQuality };
    const positive = decay.decay({ ...common, intensity: edge.trailState.positive, kind: 'ROUTE_SUCCESS' }, now, 60000);
    const negative = decay.decay({ ...common, intensity: edge.trailState.negative,
      kind: edge.quarantine ? 'SECURITY_FAILURE' : 'TEMPORARY_OUTAGE' }, now, 60000);
    return { ...edge, trailState: { ...edge.trailState, positive, negative, updatedAt: new Date(now).toISOString() } };
  });
  return { edgeCount: session.edges.length };
}

module.exports = { evaporate };
