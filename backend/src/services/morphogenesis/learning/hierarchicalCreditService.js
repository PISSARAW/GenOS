'use strict';

const CREDIT_LEVELS = Object.freeze(['worker', 'edge', 'node', 'subtree', 'composition', 'transition', 'morphology']);

function assignHierarchicalCredit(observations = []) {
  return observations.filter((item) => CREDIT_LEVELS.includes(item.level) && Number.isFinite(item.contribution))
    .map((item) => ({ level: item.level, entityId: item.entityId, contribution: Math.max(-1, Math.min(1, item.contribution)), evidence: item.evidence || [] }));
}

module.exports = { CREDIT_LEVELS, assignHierarchicalCredit };
