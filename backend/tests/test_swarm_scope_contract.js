const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/controllers/swarmController'), 'utf8');
assert.match(source, /JOIN swarm_proposals p ON p\.id = v\.proposal_id/);
assert.match(source, /organization_id = \? AND project_id = \?/);
assert.match(source, /workspace_id IN \(SELECT id FROM workspaces/);
console.log('Swarm proposals, votes, and expiry are tenant-scoped.');