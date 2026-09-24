'use strict';

const { defaultForaging } = require('../../foragingScoutHarvesterService');
const patchSelector = require('./patchSelector');
const { measureOccupancy } = require('./patchMigrationService');
const levyFlightPolicy = require('./levyFlightPolicy');

function decide(input = {}) {
  const history = Array.isArray(input.patchHistory) ? input.patchHistory : [];
  const current = defaultForaging.evaluatePatchYield(history, input.elapsedTimeSec);
  const currentReturn = Number.isFinite(input.currentMarginalReturn) ? input.currentMarginalReturn : current.marginalYield;
  const alternative = patchSelector.selectAlternative({
    currentPatchId: input.currentPatchId, currentDescriptor: input.currentDescriptor,
    alternatives: input.alternatives, elapsedTimeSec: input.elapsedTimeSec,
    environmentThreshold: input.environmentThreshold, defaultSwitchCost: input.switchCost,
    occupancyByPatch: measureOccupancy(input.ecology?.populations || [])
  });
  const shouldMigrate = Boolean(alternative && currentReturn <= alternative.netReturn);
  const explorationMove = levyFlightPolicy.planMovement({
    alternatives: input.alternatives, currentPatchId: input.currentPatchId,
    currentSpace: input.currentSpace, stepsWithoutProgress: input.stepsWithoutProgress,
    random: input.random
  });
  return {
    patchYield: current,
    currentReturn,
    alternative,
    explorationMove,
    decision: shouldMigrate ? 'PATCH_DEPARTURE' : 'STAY_ON_PATCH',
    reason: alternative ? (shouldMigrate ? 'alternative_net_return_is_better' : 'current_patch_return_is_better') : 'no_available_alternative'
  };
}

module.exports = { decide };
