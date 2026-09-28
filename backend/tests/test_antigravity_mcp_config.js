'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { buildConfig, repositoryRoot } = require('../../integrations/antigravity/configure-mcp.cjs');

const original = process.env.GENOS_MCP_LEASE;
delete process.env.GENOS_MCP_LEASE;
const configPath = path.join(repositoryRoot(), 'nonexistent-config.json');
const config = buildConfig(configPath);
if (original !== undefined) process.env.GENOS_MCP_LEASE = original;
const server = config.mcpServers.genos;
assert.equal(server.command, process.execPath);
assert.deepEqual(server.args, ['mcp/index.js']);
assert.equal(server.cwd, repositoryRoot());
assert.equal(server.env.GENOS_MCP_LEASE, 'genos_snapshot');
assert.deepEqual(Object.keys(config.mcpServers), ['genos']);
console.log('Antigravity MCP config: portable stdio path and least-privilege default lease passed.');
