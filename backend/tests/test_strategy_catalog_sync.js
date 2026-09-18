'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listStrategies } = require('../src/strategies/strategyRegistry');

function expectedLine(strategy) {
  const missing = strategy.missingPrimitives.length ? ` | missing: ${strategy.missingPrimitives.join(', ')}` : '';
  return `- ${strategy.id} | maturity: ${strategy.maturity} | execution: ${strategy.executionStatus} | primitives: ${strategy.primitives.join(', ')}${missing}`;
}

function main() {
  const catalogPath = path.resolve(__dirname, '../../strategies.md');
  const lines = new Set(fs.readFileSync(catalogPath, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('- ')));
  const strategies = listStrategies();
  assert.equal(lines.size, strategies.length);
  for (const strategy of strategies) assert.equal(lines.has(expectedLine(strategy)), true, strategy.id);
}

main();
console.log('Strategy catalog is synchronized with the runtime registry.');
