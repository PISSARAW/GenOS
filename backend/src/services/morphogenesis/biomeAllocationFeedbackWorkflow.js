'use strict';

function allocationWitness(context) {
for (let slot = 0; slot < context.groups; slot += 1) {
      if (context.visitedTotals.has(context.totals[slot]) || context.totals[slot] + context.item.weight > context.capacity) continue;
      context.visitedTotals.add(context.totals[slot]);
      context.totals[slot] += context.item.weight;
      context.bins[slot].push(context.item.id);
      if (context.place(context.index + 1)) return { value: ( true) };
      context.bins[slot].pop();
      context.totals[slot] -= context.item.weight;
      if (context.totals[slot] === 0) break;
    }
}

module.exports = { allocationWitness };
