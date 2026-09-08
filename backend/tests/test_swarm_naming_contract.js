const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/controllers/swarmController'), 'utf8');

assert.match(source, /agentId and agentName in camelCase/);
assert.doesNotMatch(source, /req\.body\?\.agentId \|\| req\.body\?\.agent_id/);
assert.doesNotMatch(source, /req\.body\?\.agentName \|\| req\.body\?\.agent_name/);

console.log('Swarm HTTP naming contract: PASS');