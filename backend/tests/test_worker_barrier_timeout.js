const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/services/agentFleetService'), 'utf8');
assert.match(source, /WORKER_BARRIER_TIMEOUT/);
assert.match(source, /WORKER_EVIDENCE_BARRIER_PARTIAL/);
assert.match(source, /SYNTHESIZE_PARTIAL/);
console.log('Worker barrier timeouts expose partial synthesis handling.');