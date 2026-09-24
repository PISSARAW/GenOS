'use strict';

const { requiredId } = require('./contractHelpers');

function createEcologicalEvent(input = {}) {
  return {
    operationId: requiredId(input.operationId, 'operationId'),
    sessionId: requiredId(input.sessionId, 'sessionId'),
    actorId: String(input.actorId || 'system'),
    previousRevision: input.previousRevision ?? null,
    resultingRevision: input.resultingRevision ?? null,
    input: input.input || {},
    decision: input.decision || null,
    appliedActions: Array.isArray(input.appliedActions) ? input.appliedActions : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    timestamp: input.timestamp || new Date().toISOString()
  };
}

module.exports = { createEcologicalEvent };
