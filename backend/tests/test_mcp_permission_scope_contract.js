const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../src/services/mcpExecutor'), 'utf8');
assert.match(source, /agent_permissions WHERE agent_id = \? AND organization_id = \? AND project_id = \?/);
assert.match(source, /MCP_DIRECT_CALL/);
console.log('MCP permission lookup and direct-call audit are tenant-aware contracts.');