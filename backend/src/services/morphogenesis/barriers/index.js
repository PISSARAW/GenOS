'use strict';

const authorityBarrier = require('./authorityBarrier');
const stateBarrier = require('./stateBarrier');
const evidenceBarrier = require('./evidenceBarrier');
const budgetBarrier = require('./budgetBarrier');
const lifecycleBarrier = require('./lifecycleBarrier');

function checkAll(pairs, contracts, config = {}) {
  const results = [];
  for (const pair of pairs) {
    const [parent, child] = pair;
    results.push({ barrier: 'authority', ...authorityBarrier.check(parent, child) });
    results.push({ barrier: 'state', ...stateBarrier.check(parent, child) });
    results.push({ barrier: 'evidence', ...evidenceBarrier.check(parent, child, config.epsilon) });
  }
  results.push({ barrier: 'budget', ...budgetBarrier.check(contracts, config.globalBudget, config.overcommitRatio) });
  results.push({ barrier: 'lifecycle', ...lifecycleBarrier.check(contracts, config.latency) });
  return { valid: results.every((result) => result.valid), results };
}

module.exports = {
  authorityBarrier,
  stateBarrier,
  evidenceBarrier,
  budgetBarrier,
  lifecycleBarrier,
  checkAll
};
