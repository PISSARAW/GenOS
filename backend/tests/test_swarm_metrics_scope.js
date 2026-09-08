const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/controllers/swarmController'), 'utf8');
assert.match(source, /telemetry_events WHERE organization_id = \? AND project_id = \?/g);
assert.match(source, /JOIN workspaces w ON w\.id = a\.workspace_id/);
console.log('Swarm metrics and topology are tenant-scoped.');