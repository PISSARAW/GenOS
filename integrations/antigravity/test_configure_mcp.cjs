'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig, writeConfig } = require('./configure-mcp.cjs');

const configPath = path.join(os.tmpdir(), `genos-antigravity-${process.pid}.json`);
const malformedPath = path.join(os.tmpdir(), `genos-antigravity-malformed-${process.pid}.json`);
const existing = { mcpServers: {
  other: { command: 'node', args: ['other.js'] },
  genos: { customField: 'preserved', env: { GENOS_MCP_DISABLED_TOOLS: 'genos_run' } },
} };
const previousLease = process.env.GENOS_MCP_LEASE;

try {
  fs.writeFileSync(configPath, JSON.stringify(existing));
  delete process.env.GENOS_MCP_LEASE;
  const config = buildConfig(configPath);
  assert.deepEqual(config.mcpServers.other, existing.mcpServers.other);
  assert.equal(config.mcpServers.genos.command, process.execPath);
  assert.deepEqual(config.mcpServers.genos.args, ['mcp/index.js']);
  assert.equal(config.mcpServers.genos.env.GENOS_MCP_LEASE, 'genos_snapshot');
  assert.equal(config.mcpServers.genos.env.GENOS_MCP_DISABLED_TOOLS, 'genos_run');
  assert.equal(config.mcpServers.genos.customField, 'preserved');
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), existing, 'building a preview must not write files');

  process.env.GENOS_MCP_LEASE = 'genos_snapshot,genos_replay';
  assert.equal(buildConfig(configPath).mcpServers.genos.env.GENOS_MCP_LEASE, 'genos_snapshot,genos_replay');
  assert.throws(() => buildConfig(path.resolve(__dirname, '../../package.json')), /mcpServers object/);
  fs.writeFileSync(malformedPath, JSON.stringify({ mcpServers: { genos: { env: [] } } }));
  assert.throws(() => buildConfig(malformedPath), /server env must be an object/);

  const writtenPath = writeConfig(configPath);
  const written = JSON.parse(fs.readFileSync(writtenPath, 'utf8'));
  assert.deepEqual(written.mcpServers.other, existing.mcpServers.other);
  assert.equal(written.mcpServers.genos.env.GENOS_MCP_DISABLED_TOOLS, 'genos_run');
  assert.equal(written.mcpServers.genos.env.GENOS_MCP_LEASE, 'genos_snapshot,genos_replay');
  assert.equal(fs.existsSync(`${configPath}.${process.pid}.tmp`), false);
} finally {
  fs.rmSync(configPath, { force: true });
  fs.rmSync(malformedPath, { force: true });
  if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
  else process.env.GENOS_MCP_LEASE = previousLease;
}

console.log('Antigravity MCP configuration tests passed.');
