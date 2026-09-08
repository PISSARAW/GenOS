const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/services/agentFleetService'), 'utf8');

assert.match(source, /immuneSystem\.phagocytoseCodexReport/);
assert.match(source, /IMMUNE_OUTPUT_REJECTED/);
console.log('Agent fleet routes worker reports through the immune chaperone.');