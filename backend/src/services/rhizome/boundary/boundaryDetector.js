'use strict';

const { detectGap } = require('./capabilityGapService');
const { hasGapEvidence } = require('./gapEvidenceService');

function inspect(session, need) {
  const gap = detectGap(session, need);
  if (!gap) return { reachable: true, gap: null, growthPermitted: false };
  return { reachable: false, gap, growthPermitted: hasGapEvidence(gap) };
}

module.exports = { inspect };
