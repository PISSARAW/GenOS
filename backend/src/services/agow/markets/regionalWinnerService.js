'use strict';

const arbitration = require('../workspaceArbitrationService');

function compete(options) {
  const result = arbitration.arbitrate({ candidates: options.candidates, capacity: options.capacity || 1,
    regretContext: options.regretContext, competition: options.competition });
  const winners = result.selected;
  const receipt = { receiptId: `${options.marketId}:${Date.now()}`,
    marketId: options.marketId, competitorIds: options.candidates.map((candidate) => candidate.candidateId),
    winnerIds: winners.map((candidate) => candidate.candidateId),
    reason: winners.length ? 'regional_competition' : 'no_eligible_regional_winner', createdAt: Date.now() };
  return { winners, receipt, result };
}

module.exports = { compete };
