const assert = require('node:assert/strict');
const { selectStrategyPortfolio } = require('../src/strategies/strategySelector');

const implementation = selectStrategyPortfolio({ problem: 'Implement a backend API' });
assert.equal(implementation.profile.type, 'implementation');
assert.equal(implementation.portfolio.some((strategy) => strategy.id === 'computer_use_direct'), false);

const desktop = selectStrategyPortfolio({ problem: 'Open notepad and click on the screen' });
assert.equal(desktop.profile.type, 'desktop_control');
assert.equal(desktop.portfolio.some((strategy) => strategy.id === 'computer_use_direct'), true);

console.log('Strategy domain eligibility checks passed.');