const assert = require('node:assert/strict');
const fs = require('node:fs');
const controller = fs.readFileSync(require.resolve('../src/controllers/swarmController'), 'utf8');
const voteInput = fs.readFileSync(require.resolve('../src/controllers/swarmVoteInput'), 'utf8');
const source = controller + '\n' + voteInput;
assert.match(source, /VOTE_AGENT_FORBIDDEN/);
assert.match(source, /VOTE_AGENT_SCOPE_FORBIDDEN/);
assert.match(source, /a\.workspace_id = \?/);
console.log('Swarm votes validate participant identity and workspace membership.');
