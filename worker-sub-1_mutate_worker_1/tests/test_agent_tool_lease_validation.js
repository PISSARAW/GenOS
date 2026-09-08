const assert = require('assert');
const { parseToolLease } = require('../src/grpc_services/agentService');

assert.deepEqual(parseToolLease('["genos_snapshot", " genos_snapshot "]'), ['genos_snapshot']);
assert.deepEqual(parseToolLease(''), []);
for (const value of ['{}', '"genos_snapshot"', '["genos_snapshot", 42]', '[""]']) {
  assert.throws(() => parseToolLease(value), /tool_lease_json/);
}
console.log('Agent tool lease validation checks passed.');