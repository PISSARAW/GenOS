import assert from 'node:assert/strict';
import { toolIsLeased } from './lease.js';
const tools = [{ name: 'genos_orchestrate' }, { name: 'genos_fork' }];
assert.equal(toolIsLeased('genos_fork', tools, { GENOS_MCP_EXPOSE_ALL: 'true', NODE_ENV: 'production' }), false);
assert.equal(toolIsLeased('genos_fork', tools, { GENOS_MCP_EXPOSE_ALL: 'true', GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL: 'true', NODE_ENV: 'development' }), true);
assert.equal(toolIsLeased('genos_fork', tools, { GENOS_MCP_EXPOSE_ALL: 'true', GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL: 'true', GENOS_MCP_DISABLED_TOOLS: 'genos_fork', NODE_ENV: 'development' }), false);
console.log('MCP identity lease checks passed.');
