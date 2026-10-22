'use strict';

const { digest } = require('./securityPerceptionPrimitives');

function upsert(state, detection, observation) {
  const key = digest({ sensorId: observation.sensorId, subject: observation.subject,
    evidence: [...detection.evidence].sort(), classification: detection.classification });
  const previous = state.alerts[key];
  const alert = { id: key, firstSeenAt: previous?.firstSeenAt || observation.observedAt,
    lastSeenAt: observation.observedAt, occurrences: (previous?.occurrences || 0) + 1,
    classification: detection.classification, confidence: detection.confidence,
    evidence: detection.evidence, observationHash: detection.observationHash };
  state.alerts[key] = alert;
  return { alert, duplicate: Boolean(previous) };
}

module.exports = { upsert };
