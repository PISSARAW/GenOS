const assert = require('node:assert/strict');
const { buildStrategyContract, validateContract } = require('../src/services/strategyContractService');

const contract = buildStrategyContract({ problem: 'Implement a deterministic service.' });
assert.doesNotThrow(() => validateContract(contract));
const badStatus = { ...contract, strategy_decisions: contract.strategy_decisions.map((decision) => decision.id === contract.selected_strategy.primary ? { ...decision, status: 'eligible_not_selected' } : decision) };
assert.throws(() => validateContract(badStatus), /selected strategy_decisions/);
const badScore = { ...contract, strategy_decisions: contract.strategy_decisions.map((decision) => decision.id === contract.selected_strategy.primary ? { ...decision, score: null } : decision) };
assert.throws(() => validateContract(badScore), /finite score/);
console.log('Strategy contract consistency checks passed.');
