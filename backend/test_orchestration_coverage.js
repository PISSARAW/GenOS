const assert = require('assert');
const { MCP_TOOL_COUNT, observedTools } = require('./src/services/orchestrationCoverageService');
assert.equal(MCP_TOOL_COUNT, 66);
assert.deepEqual(observedTools([{ action: 'genos_snapshot', detail: 'then genos_replay', payload_json: '{"tool":"genos_merge"}' }]), ['genos_merge', 'genos_replay', 'genos_snapshot']);
console.log('Orchestration coverage checks passed.');
