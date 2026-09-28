#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function repositoryRoot() {
  return path.resolve(__dirname, '../..');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateGenosConfig(config) {
  const genos = config.mcpServers.genos;
  if (genos !== undefined && !isRecord(genos)) throw new Error('Antigravity GenOS server config must be an object.');
  if (genos?.env !== undefined && !isRecord(genos.env)) throw new Error('Antigravity GenOS server env must be an object.');
}

function readExisting(configPath) {
  if (!fs.existsSync(configPath)) return { mcpServers: {} };
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!isRecord(config) || !isRecord(config.mcpServers)) {
    throw new Error('Antigravity config must contain an mcpServers object.');
  }
  validateGenosConfig(config);
  return config;
}

function genosServer(root, existing = {}) {
  const env = existing.env || {};
  const lease = process.env.GENOS_MCP_LEASE || env.GENOS_MCP_LEASE || 'genos_snapshot';
  return {
    ...existing,
    command: process.execPath,
    args: ['mcp/index.js'],
    cwd: root,
    env: { ...env, GENOS_MCP_LEASE: lease },
  };
}

function buildConfig(configPath = path.join(repositoryRoot(), '.agents', 'mcp_config.json')) {
  const config = readExisting(configPath);
  config.mcpServers.genos = genosServer(repositoryRoot(), config.mcpServers.genos);
  return config;
}

function writeConfig(configPath = path.join(repositoryRoot(), '.agents', 'mcp_config.json')) {
  const config = buildConfig(configPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, configPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
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

module.exports = { buildConfig, genosServer, repositoryRoot, writeConfig };
