'use strict';

const { INTERACTION_TYPES } = require('../constants');
const { requiredId, enumValue, nonNegative } = require('./contractHelpers');

function createEcologicalLink(input = {}) {
  return {
    sourceId: requiredId(input.sourceId, 'sourceId'),
    targetId: requiredId(input.targetId, 'targetId'),
    type: enumValue({ value: input.type, choices: INTERACTION_TYPES, field: 'type' }),
    strength: nonNegative(input.strength, 'strength'),
    confidence: nonNegative(input.confidence, 'confidence'),
    historicalEffect: Number.isFinite(input.historicalEffect) ? input.historicalEffect : 0,
    resourceOverlap: nonNegative(input.resourceOverlap, 'resourceOverlap'),
    informationOverlap: nonNegative(input.informationOverlap, 'informationOverlap')
  };
}

module.exports = { createEcologicalLink };
