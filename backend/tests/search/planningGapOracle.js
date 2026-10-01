'use strict';
const assert = require('node:assert/strict');
const Domain = require('../../src/services/search/planningGapDomain');

function trapOptimal(task) {
  const queue = [{ state: { ...task.start, keys: new Set() }, depth: 0 }];
  const seen = new Set([Domain.trapKey(queue[0].state)]);
  for (let index = 0; index < queue.length; index += 1) {
    const { state, depth } = queue[index];
    if (Domain.isGoalTrap(state, task)) return depth;
    for (const move of Domain.trapSuccessors(state, task)) {
      const next = Domain.applyTrap(state, move);
      const key = Domain.trapKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, depth: depth + 1 });
    }
  }
  return null;
}

function optimalLength(task) {
  const length = task.domain === 'blocksworld'
    ? Domain.bfsOptimal(task, 100000)?.length : trapOptimal(task);
  assert.ok(Number.isInteger(length), `${task.id}: oracle must establish optimum`);
  return length;
}
module.exports = { optimalLength };
