const assert = require('assert');
const {
  normalizeExecutor, resolveExecutor, assertCallerMcpConfiguration
} = require('../src/services/cognitiveExecutor');

assert.equal(normalizeExecutor(' CALLER_MCP '), 'caller_mcp');
assert.equal(resolveExecutor({ executor: 'codex' }, {}), 'codex');
assert.throws(
  () => resolveExecutor({ executor: 'unknown' }, {}),
  (error) => error.code === 'UNSUPPORTED_EXECUTOR'
);
assert.throws(
  () => assertCallerMcpConfiguration({ executor: 'caller_mcp' }, {}),
  (error) => error.code === 'MCP_SAMPLING_UNAVAILABLE'
);
assert.doesNotThrow(() => assertCallerMcpConfiguration(
  { executor: 'caller_mcp' }, { GENOS_MCP_SAMPLING_URL: 'http://127.0.0.1:1/sample' }
));
console.log('Cognitive executor contract tests passed.');
