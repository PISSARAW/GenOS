const assert = require('node:assert/strict');
const { selectStrategyPortfolio, classifyProblem } = require('../src/strategies/strategySelector');

const broad = selectStrategyPortfolio({ problem: 'Investigate an unknown root cause bug', portfolioSize: 12 });
assert.equal(broad.portfolio.length, 12);
assert.equal(classifyProblem('Open Notepad and click the screen'), 'desktop_control');

const inhibited = selectStrategyPortfolio({
  problem: 'Investigate an unknown root cause bug',
  portfolioSize: 12,
  memorySignals: { inhibitedStrategyIds: [broad.primary.id] }
});
assert.notEqual(inhibited.primary.id, broad.primary.id);
assert.equal(inhibited.portfolio.some((strategy) => strategy.id === broad.primary.id), false);

console.log('Thalamus portfolio and inhibitory signals: PASS');