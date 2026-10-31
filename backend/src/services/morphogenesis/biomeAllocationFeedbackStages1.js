'use strict';

function allocationWitnessStage1(__genosStageScope1) {
for (let slot = 0; slot < __genosStageScope1.groups; slot += 1) {
      if (__genosStageScope1.visitedTotals.has(__genosStageScope1.totals[slot]) || __genosStageScope1.totals[slot] + __genosStageScope1.item.weight > __genosStageScope1.capacity) continue;
      __genosStageScope1.visitedTotals.add(__genosStageScope1.totals[slot]);
      __genosStageScope1.totals[slot] += __genosStageScope1.item.weight;
      __genosStageScope1.bins[slot].push(__genosStageScope1.item.id);
      if ((0, __genosStageScope1.place)(__genosStageScope1.index + 1)) return { value: ( true) };
      __genosStageScope1.bins[slot].pop();
      __genosStageScope1.totals[slot] -= __genosStageScope1.item.weight;
      if (__genosStageScope1.totals[slot] === 0) break;
    }
}

module.exports = { allocationWitnessStage1 };
