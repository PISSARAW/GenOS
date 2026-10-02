#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = path.join(__dirname, 'plugin');
const profile = require('./development-profile.json');

function hookConfig() {
  const script = path.join(root, 'integrations/codex/session-hook.cjs');
  const command = `node "${script.replaceAll('\\', '/')}" --workspace "${root.replaceAll('\\', '/')}"`;
  const commandWindows = `node "${script}" --workspace "${root}"`;
  const events = ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreCompact', 'PostCompact', 'Stop'];
  const handlers = events.map((event) => [event, [{ hooks: [hookHandler(command, commandWindows)] }]]);
  return { description: 'GenOS Codex session checkpoint and evidence gates', hooks: Object.fromEntries(handlers) };
}

function hookHandler(command, commandWindows) {
  return {
    type: 'command',
    command,
    commandWindows,
    timeout: 30,
    statusMessage: 'Chargement du contexte de session GenOS'
  };
}

function serverConfig(existing = {}) {
  return {
    ...existing,
    command: process.execPath,
    args: [path.join(root, 'mcp/index.js')],
    cwd: root,
    env: {
      ...existing.env,
      GENOS_REPO_ROOT: root,
      GENOS_WORKSPACE_ROOT: root,
      GENOS_BIN: path.join(root, 'target/debug', process.platform === 'win32' ? 'genos.exe' : 'genos'),
      GENOS_MCP_LEASE: profile.tools.join(','),
      GENOS_MCP_TOOL_TIMEOUT_MS: '120000'
    }
  };
}

function validateSkills() {
  const catalog = require('../../shared/toolDefinitions.json').tools;
  const names = new Set(catalog.map((tool) => tool.name));
  for (const name of profile.tools) {
    if (!names.has(name)) throw new Error(`Profile tool missing from catalog: ${name}`);
  }
  for (const name of fs.readdirSync(path.join(source, 'skills'))) {
    const skill = fs.readFileSync(path.join(source, 'skills', name, 'SKILL.md'), 'utf8');
    const tools = skill.match(/genos_[a-z_]+/g) || [];
    for (const tool of tools) {
      if (!names.has(tool)) throw new Error(`Skill ${name} references missing tool ${tool}`);
    }
  }
}

function installPlugin(target) {
  validateSkills();
  const configPath = path.join(target, '.mcp.json');
  const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!existing.mcpServers || !existing.mcpServers.genos) throw new Error('Target must be an existing GenOS plugin.');
  const config = { ...existing, mcpServers: { ...existing.mcpServers, genos: serverConfig(existing.mcpServers.genos) } };
  const manifestPath = path.join(target, '.codex-plugin/plugin.json');
  const manifest = { ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), ...require('./plugin/.codex-plugin/plugin.json') };
  if (!fs.existsSync(`${configPath}.before-p0`)) fs.copyFileSync(configPath, `${configPath}.before-p0`);
  const backup = path.join(target, 'before-p0');
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(backup);
    fs.copyFileSync(manifestPath, path.join(backup, 'plugin.json'));
    if (fs.existsSync(path.join(target, 'skills'))) fs.cpSync(path.join(target, 'skills'), path.join(backup, 'skills'), { recursive: true });
  }
  fs.cpSync(path.join(source, 'skills'), path.join(target, 'skills'), { recursive: true });
  const hooks = path.join(target, 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  const hookPath = path.join(hooks, 'hooks.json');
  if (fs.existsSync(hookPath) && !fs.existsSync(`${hookPath}.before-p1`)) fs.copyFileSync(hookPath, `${hookPath}.before-p1`);
  fs.writeFileSync(hookPath, `${JSON.stringify(hookConfig(), null, 2)}\n`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

if (require.main === module) {
  try {
    const index = process.argv.indexOf('--plugin-dir');
    if (index !== -1) {
      const target = process.argv[index + 1];
      if (!target) throw new Error('--plugin-dir requires an existing plugin directory.');
      installPlugin(path.resolve(target));
      console.log('GenOS plugin configured. Reload the plugin and start a new Codex session.');
    } else {
      validateSkills();
      console.log(JSON.stringify({ mcpServers: { genos: serverConfig() } }, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { serverConfig, validateSkills, installPlugin, hookConfig };
