'use strict';

const store = require('../holobiontStore');
const { transmitVertically } = require('./verticalTransmissionService');
const { acquireHorizontally } = require('./horizontalAcquisitionService');

function mixedTransmissionError(message, code = 'HOLOBIONT_MIXED_TRANSMISSION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function horizontalInputs(input) {
  const acquisitions = input.horizontalAcquisitions || [];
  if (!Array.isArray(acquisitions)) throw mixedTransmissionError('horizontalAcquisitions must be an array.');
  return acquisitions;
}

async function acquirePeriphery(db, input, childSession) {
  const results = [];
  for (const acquisition of horizontalInputs(input)) {
    const result = await acquireHorizontally(db, {
      ...acquisition, holobiontId: childSession.holobiontId,
      expectedSessionRevision: childSession.revision
    });
    results.push(result);
    childSession = await store.getSession(db, childSession.holobiontId);
  }
  return { results, childSession };
}

async function transmitMixedGeneration(db, input = {}) {
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) {
    throw mixedTransmissionError('Vertical inheritance evidence is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  }
  const vertical = await transmitVertically(db, {
    parentHolobiontId: input.parentHolobiontId,
    expectedParentRevision: input.expectedParentRevision,
    childHostId: input.childHostId,
    generation: input.generation,
    evidenceRefs: input.evidenceRefs,
    actorId: input.actorId,
    verifierId: input.verifierId,
    riskScore: input.riskScore
  });
  const periphery = await acquirePeriphery(db, input, vertical.child);
  return {
    child: periphery.childSession,
    verticalResults: vertical.results,
    horizontalResults: periphery.results,
    transmissionHistory: periphery.childSession.transmissionState.history || []
  };
}

module.exports = { transmitMixedGeneration };
