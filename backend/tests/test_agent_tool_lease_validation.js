const assert = require('assert');
const { parseToolLease } = require('../bin/agent-runtime-session.cjs');

assert.deepEqual(parseToolLease('["genos_snapshot", " genos_snapshot "]'), ['genos_snapshot']);
assert.deepEqual(parseToolLease(''), []);
for (const value of ['not-json', '{}', '"genos_snapshot"', '["genos_snapshot", 42]', '[""]']) {
  assert.strictEqual(parseToolLease(value), null);
  process.exitCode = 0;
}
console.log('Agent tool lease validation checks passed.');
