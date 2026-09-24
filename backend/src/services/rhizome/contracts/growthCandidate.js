'use strict';

const { objectValue, textValue, enumValue, numberValue, listValue } = require('./validation');

const GROWTH_ACTIONS = Object.freeze([
  'REUSE', 'RECONFIGURE', 'CONNECT', 'BRIDGE', 'ADAPT_PROCEDURE', 'WAKE_DORMANT',
  'ATTACH_SERVICE', 'SPAWN_WORKER', 'SPAWN_SUB_TOPOLOGY'
]);

function normalizeGrowthCandidate(value) {
  const candidate = objectValue(value, 'GrowthCandidate');
  return {
    candidateId: textValue(candidate.candidateId, 'candidateId'),
    action: enumValue(candidate.action, { allowed: GROWTH_ACTIONS, field: 'action' }),
    targetNodeIds: listValue(candidate.targetNodeIds, 'targetNodeIds'),
    expectedUtility: numberValue(candidate.expectedUtility, 'expectedUtility', { maximum: 1 }),
    creationCost: numberValue(candidate.creationCost, 'creationCost'),
    coordinationCost: numberValue(candidate.coordinationCost, 'coordinationCost'),
    duplicationRisk: numberValue(candidate.duplicationRisk, 'duplicationRisk', { maximum: 1 }),
    sufficient: candidate.sufficient === true,
    evidenceRefs: listValue(candidate.evidenceRefs, 'evidenceRefs')
  };
}

module.exports = { GROWTH_ACTIONS, normalizeGrowthCandidate };
