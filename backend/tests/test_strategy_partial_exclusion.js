const assert = require('node:assert/strict');
const { selectStrategyPortfolio } = require('../src/strategies/strategySelector');

const result = selectStrategyPortfolio({ problem: 'production incident outage' });
assert.equal(result.portfolio.some((strategy) => strategy.executionStatus === 'partial'), false);
assert.equal(result.decisions
	.filter((decision) => decision.strategy.maturity === 'partial')
	.every((decision) => decision.eligible === false), true);
console.log('Partial strategy exclusion checks passed.');