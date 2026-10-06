'use strict';

const eventLog = require('../daemonEventLog');

function observation(context, event, details) {
  const payload = eventLog.parsePayload(event);
  return {
    territoryId: context.territoryId, headSha: context.headSha,
    scope: payload.file ? { type: 'file', value: payload.file } : { type: 'cross-cutting', value: 'territory' },
    claim: details.claim, severity: details.severity || 'medium',
    falsification: details.falsification, sourceEventId: event.id
  };
}

function detectResourceAnomaly(context) {
  return (context.events || []).filter((event) => ['BUILD_FAILED', 'RESOURCE_ORPHANED'].includes(event.event_type))
    .map((event) => observation(context, event, {
      claim: `Territorial ${event.event_type.toLowerCase()} event ${event.id} requires measured resource verification`,
      falsification: 'A subsequent measured build or owner check establishes recovery'
    }));
}

function detectContractDrift(context) {
  return (context.events || []).filter((event) => eventLog.parsePayload(event).contractDrift === true)
    .map((event) => observation(context, event, {
      claim: `Recorded producer/consumer contract drift in event ${event.id} requires contract replay`,
      falsification: 'Producer and consumer replay the same contract successfully'
    }));
}

function detectCrossRepoDrift(context) {
  const observations = [];
  for (const event of context.events || []) {
    const payload = eventLog.parsePayload(event);
    if (!payload.peerTerritoryId || !payload.contract || payload.expectedHash === payload.actualHash) continue;
    if (!/^[a-f0-9]{64}$/.test(payload.expectedHash || '') || !/^[a-f0-9]{64}$/.test(payload.actualHash || '')) continue;
    observations.push(observation(context, event, {
      claim: `Shared contract ${payload.contract} differs from peer territory ${payload.peerTerritoryId} in recorded event ${event.id}`,
      falsification: 'Scoped producer and consumer contract hashes agree after independent replay'
    }));
  }
  return observations;
}

function detectKnowledgeGap(context) {
  return (context.events || []).filter((event) => event.event_type === 'KNOWLEDGE_STALE')
    .map((event) => observation(context, event, {
      claim: `Recorded knowledge gap in territory event ${event.id} requires a fresh scoped source survey`,
      severity: 'low', falsification: 'A new index and source verification close the recorded knowledge gap'
    }));
}

function detectors() {
  return [
    { id: 'resource-anomaly', detect: detectResourceAnomaly },
    { id: 'contract-drift', detect: detectContractDrift },
    { id: 'cross-repo-drift', detect: detectCrossRepoDrift },
    { id: 'knowledge-gap', detect: detectKnowledgeGap }
  ];
}

module.exports = { detectors };
