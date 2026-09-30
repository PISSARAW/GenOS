'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const mcpBinary = process.env.GENOS_MCP_BIN || path.join(repoRoot, 'target', 'debug', process.platform === 'win32' ? 'genos-mcp.exe' : 'genos-mcp');
const cliBinary = process.env.GENOS_BIN || path.join(repoRoot, 'target', 'debug', process.platform === 'win32' ? 'genos.exe' : 'genos');

function invoke({ feature, action, args = {}, scopes = [] }) {
  const request = {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'genos_biomimicry', arguments: { feature, action, params: args } }
  };
  const env = { ...process.env, GENOS_WORKSPACE_ROOT: repoRoot, GENOS_BIN: cliBinary, GENOS_MCP_LEASE: ['genos_biomimicry', ...scopes].join(','), GENOS_MCP_DISABLED_TOOLS: '' };
  delete env.GENOS_MCP_LEASE_EXPIRES_AT;
  const child = spawnSync(mcpBinary, [], { cwd: repoRoot, env, input: `${JSON.stringify(request)}\n`, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  assert.equal(child.error, undefined, child.error && child.error.message);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const responseLine = child.stdout.trim().split(/\r?\n/).at(-1);
  return JSON.parse(responseLine).result;
}

function allowed({ feature, action, args, measuredField }) {
  const scope = `genos_biomimicry::${feature}::${action}`;
  const result = invoke({ feature, action, args, scopes: [scope] });
  assert.equal(result.isError, false, result.content && result.content[0] && result.content[0].text);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.success, true, result.content[0].text);
  assert.equal(payload.feature, feature);
  assert.equal(payload.action, action);
  if (measuredField) assert.ok(measuredField(payload), `${feature}/${action} should return measured output`);
}

const denied = invoke({ feature: 'choanocyte', action: 'sift', args: { payload: 'MISSION_SIGNAL', is_noise: false } });
assert.equal(denied.isError, true, 'generic tool lease alone must refuse a specialized action');
assert.match(denied.content[0].text, /outside the active GenOS MCP lease/);

allowed({ feature: 'electrocyte', action: 'voltage', args: { cell_count: 100, columns: 1 }, measuredField: (value) => Number.isFinite(value.theoretical_voltage_v) });
allowed({ feature: 'choanocyte', action: 'sift', args: { payload: 'MISSION_SIGNAL_42', is_noise: false }, measuredField: (value) => value.sifting_result.total_scanned === 1 });
allowed({ feature: 'iridophore', action: 'shift', args: { spacing_nm: 220 }, measuredField: (value) => Number.isFinite(value.reflected_wavelength_nm) });
allowed({ feature: 'iridophore', action: 'render', args: { data: 'MISSION_EVIDENCE', perspective: 'json' }, measuredField: (value) => typeof value.rendered_output === 'string' });
allowed({ feature: 'guard_cell', action: 'throttle', args: { flux: 100, water: 0.5, aba: 0.8 }, measuredField: (value) => value.throttle_result !== undefined });
allowed({ feature: 'tracheid', action: 'transport', args: { pipeline_id: 'fixture', volume: 42, tension: -3.5 }, measuredField: (value) => Number.isFinite(value.transport_yield && value.transport_yield.transported_volume) });
allowed({ feature: 'prokaryote', action: 'conjugate', args: { donor_id: 'donor', recipient_id: 'recipient', plasmid_id: 'fixture-plasmid' }, measuredField: (value) => value.hgt_report !== undefined });

console.log('MCP-to-CLI specialized-cell runtime, exact action scopes and measured outputs passed.');
