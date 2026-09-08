const assert = require('node:assert/strict');
const { buildStrategyContract, validateContract } = require('../src/services/strategyContractService');
const { registryHealth } = require('../src/strategies/strategyRegistry');

const contract = buildStrategyContract({ problem: 'Implement a small deterministic service.' });
assert.match(contract.strategy_registry.registry_hash, /^sha256:[a-f0-9]{64}$/);
assert.doesNotThrow(() => validateContract(contract));
const changed = { ...contract, strategy_registry: { ...contract.strategy_registry, registry_hash: `sha256:${'0'.repeat(64)}` } };
assert.throws(() => validateContract(changed), (error) => error.code === 'STRATEGY_REGISTRY_CHANGED');
assert.equal(registryHealth().registryHash, contract.strategy_registry.registry_hash);
console.log('Strategy registry hash checks passed.');
