const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/services/mcpStrategyTools.js'), 'utf8');
assert.match(source, /SELECT event_id, event_type/);
assert.match(source, /WITH RECURSIVE ancestors/);
assert.match(source, /strategyOutput\(complete/);
assert.doesNotMatch(source, /evidence: \[\],\s*provenance: \{ source: 'local_strategy_bridge'/);
console.log('Blame and lineage require persisted provenance.');
