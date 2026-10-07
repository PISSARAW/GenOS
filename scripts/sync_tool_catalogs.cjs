'use strict';

/**
 * One-shot alignment of the MCP tool catalogs.
 *
 * Canonical rule: `shared/toolDefinitions.json` is the advertised catalog and
 * `mcp/toolDefinitions.json` is its bundled fallback — the two files must be
 * byte-identical. For tools owned by the backend contract
 * (`backend/src/services/mcpContract.js`), the advertised `inputSchema` is
 * enriched from `getFullToolSchema` without deleting existing public fields.
 *
 * Usage: node scripts/sync_tool_catalogs.cjs
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SHARED_PATH = path.join(REPO_ROOT, 'shared', 'toolDefinitions.json');
const BUNDLED_PATH = path.join(REPO_ROOT, 'mcp', 'toolDefinitions.json');

const CONTRACT_OWNED = new Set([
  'genos_orchestrate',
  'genos_delegate_worker',
  'genos_worker_publish',
  'genos_worker_inbox',
  'genos_trinity_launch',
  'genos_a_team_preview',
  'genos_biological_mode',
  'genos_topology_session',
  'genos_snapshot',
  'genos_replay',
  'genos_capsule_create',
  'genos_merge',
  'genos_audit',
  'genos_biomimicry',
  'genos_v2_init',
  'genos_v2_fork',
  'genos_execute_primitive',
  'genos_execute_strategy_pipeline',
  'genos_change_strategy',
  'genos_report_progress',
  'genos_change_organization',
  'genos_organization_state',
]);

const PIPELINE_ENTRY = {
  name: 'genos_execute_strategy_pipeline',
  category: 'Strategy Primitives',
  risk: 'Amber',
  description: 'Execute an ordered pipeline of registered GenOS strategy primitives with shared context and telemetry.',
};

function mergeSchema(generated, existing = {}) {
  return {
    ...generated,
    ...existing,
    properties: { ...generated.properties, ...existing.properties },
    required: [...new Set([...(generated.required || []), ...(existing.required || [])])]
  };
}

function main() {
  const contract = require(path.join(REPO_ROOT, 'backend', 'src', 'services', 'mcpContract.js'));
  const shared = JSON.parse(fs.readFileSync(SHARED_PATH, 'utf8'));
  const tools = Array.isArray(shared.tools) ? shared.tools : shared;

  let pipeline = tools.find((tool) => tool.name === PIPELINE_ENTRY.name);
  if (!pipeline) {
    pipeline = { ...PIPELINE_ENTRY };
    const anchor = tools.findIndex((tool) => tool.name === 'genos_execute_primitive');
    tools.splice(anchor === -1 ? tools.length : anchor + 1, 0, pipeline);
  }

  for (const tool of tools) {
    if (!CONTRACT_OWNED.has(tool.name)) continue;
    if (!contract.TOOL_BASE_SCHEMAS[tool.name]) {
      console.warn(`[sync] backend contract has no base schema for ${tool.name}; keeping catalog schema.`);
      continue;
    }
    tool.inputSchema = mergeSchema(contract.getFullToolSchema(tool.name), tool.inputSchema);
  }

  const payload = `${JSON.stringify({ tools }, null, 2)}\n`;
  fs.writeFileSync(SHARED_PATH, payload);
  fs.writeFileSync(BUNDLED_PATH, payload);
  console.log(`[sync] wrote ${tools.length} tools to shared/ and mcp/ catalogs.`);
}

if (require.main === module) main();

module.exports = { mergeSchema };
