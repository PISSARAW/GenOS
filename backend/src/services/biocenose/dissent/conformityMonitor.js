'use strict';

function inspect(update, communityUpdates) {
  const socialOnly = update.reasonCodes.some((code) => ['MAJORITY_SIGNAL', 'AUTHORITY_SIGNAL'].includes(code))
    && update.evidenceRefs.length === 0;
  const recentChanges = communityUpdates.filter((item) => item.updateId !== update.updateId
    && item.changedClaims.some((claimId) => update.changedClaims.includes(claimId)));
  return {
    conformitySignal: socialOnly,
    groupthinkRisk: socialOnly && recentChanges.length > 0,
    relatedUpdateIds: recentChanges.map((item) => item.updateId)
  };
}

module.exports = { inspect };
