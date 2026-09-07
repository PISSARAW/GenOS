const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../bin/genos-agent-runtime.cjs'), 'utf8');
assert.match(source, /strategyContract\.promotion\?\.require_human_approval === true/);
assert.match(source, /AGENT_AWAITING_APPROVAL/);
console.log('Codex promotion is guarded by human approval.');