const assert = require('node:assert/strict');
const registry = require('../src/services/mcpToolRegistry');
const breaker = require('../src/services/circuitBreaker');

const original = breaker.canExecute;
breaker.canExecute = () => ({ allowed: false, reason: 'CIRCUIT_OPEN', message: 'test circuit open' });
registry.dispatchTool('genos_strat_verify', {}).then((result) => {
  assert.equal(result.result.status, 'circuit_open');
  assert.equal(result.result.code, 'CIRCUIT_OPEN');
  console.log('Direct MCP registry dispatch honors the circuit breaker.');
}).catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { breaker.canExecute = original; });