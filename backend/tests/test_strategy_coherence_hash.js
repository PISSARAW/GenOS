const assert = require('node:assert/strict');
const { hashContract } = require('../src/services/strategyContractService');
const { hashStrategyContract, verifyContractIntegrity } = require('../src/services/strategyCoherenceValidator');

const contract = { schema: 'genos.strategy-contract/v1alpha1', selected_strategy: { primary: 'deterministic_direct_path' }, promotion: { require_replay: true }, strategy_decisions: [{ id: 'a', score: 1 }] };
const expected = hashContract(contract);
assert.equal(hashStrategyContract(contract), expected);
const mutated = { ...contract, promotion: { require_replay: false } };
assert.equal(verifyContractIntegrity(mutated, expected).verified, false);
console.log('Strategy coherence hash checks passed.');
