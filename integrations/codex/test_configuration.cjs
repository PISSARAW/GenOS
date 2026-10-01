'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serverConfig, validateSkills, installPlugin } = require('./configure.cjs');

validateSkills();
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-plugin-test-'));
try {
  fs.mkdirSync(path.join(target, '.codex-plugin'));
  fs.writeFileSync(path.join(target, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'genos', interface: { displayName: 'GenOS' } }));
  fs.writeFileSync(path.join(target, '.mcp.json'), JSON.stringify({ mcpServers: {
    other: { command: 'preserved' },
    genos: { command: 'missing.exe', env: { GENOS_MCP_DISABLED_TOOLS: 'genos_audit' } }
  } }));
  const result = installPlugin(target);
  assert.equal(result.mcpServers.other.command, 'preserved');
  assert.equal(result.mcpServers.genos.command, process.execPath);
  assert.equal(result.mcpServers.genos.env.GENOS_MCP_DISABLED_TOOLS, 'genos_audit');
  assert.ok(result.mcpServers.genos.env.GENOS_MCP_LEASE.includes('genos_record_decision'));
  assert.ok(fs.existsSync(result.mcpServers.genos.args[0]));
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, '.codex-plugin/plugin.json'))).interface.displayName, 'GenOS');
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, '.mcp.json.before-p0'))).mcpServers.genos.command, 'missing.exe');
  assert.ok(fs.existsSync(path.join(target, 'skills/genos-development/SKILL.md')));
  assert.deepEqual(serverConfig().args, result.mcpServers.genos.args);
} finally {
  fs.rmSync(target, { recursive: true, force: true });
}
console.log('Codex plugin configuration and all skill references verified.');
