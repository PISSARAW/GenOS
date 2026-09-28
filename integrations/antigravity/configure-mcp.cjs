#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function repositoryRoot() {
  return path.resolve(__dirname, '../..');
}

function readExisting(configPath) {
  if (!fs.existsSync(configPath)) return { mcpServers: {} };
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
    throw new Error('Antigravity config must contain an mcpServers object.');
  }
  return config;
}

function genosServer(root) {
  return {
    command: process.execPath,
    args: ['mcp/index.js'],
    cwd: root,
    env: { GENOS_MCP_LEASE: process.env.GENOS_MCP_LEASE || 'genos_snapshot' },
  };
}

function buildConfig(configPath = path.join(repositoryRoot(), '.agents', 'mcp_config.json')) {
  const config = readExisting(configPath);
  config.mcpServers.genos = genosServer(repositoryRoot());
  return config;
}

function writeConfig() {
  const configPath = path.join(repositoryRoot(), '.agents', 'mcp_config.json');
  const config = buildConfig(configPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  return configPath;
}

if (require.main === module) {
  try {
    if (process.argv.includes('--print')) process.stdout.write(`${JSON.stringify(buildConfig(), null, 2)}\n`);
    else process.stdout.write(`Configured Antigravity MCP at ${writeConfig()}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { buildConfig, genosServer, repositoryRoot };
