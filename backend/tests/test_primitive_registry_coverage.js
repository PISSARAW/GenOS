const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');

for (const primitive of ['beam_search', 'budget_allocation', 'mcts_select', 'sandbox', 'pheromone_deposit', 'quorum', 'brier_scores', 'replay', 'causal_rebase', 'provenance']) {
  assert.equal(typeof adapter.getHandlers()[primitive], 'function', `${primitive} must have an executable handler`);
}
console.log('Primitive registry coverage checks passed.');