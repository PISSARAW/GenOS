'use strict';

const assert = require('node:assert/strict');
const { mergeSchema } = require('../sync_tool_catalogs.cjs');
const { tools } = require('../../shared/toolDefinitions.json');
const contract = require('../../backend/src/services/mcpContract');

for (const tool of tools) {
  if (!contract.TOOL_BASE_SCHEMAS[tool.name]) continue;
  const merged = mergeSchema(contract.getFullToolSchema(tool.name), tool.inputSchema);
  for (const [field, schema] of Object.entries(tool.inputSchema.properties || {})) {
    assert.deepEqual(merged.properties[field], schema, `${tool.name}.${field} must survive catalog sync`);
  }
  for (const field of tool.inputSchema.required || []) {
    assert.ok(merged.required.includes(field), `${tool.name}.${field} must remain required`);
  }
  assert.equal(new Set(merged.required).size, merged.required.length, `${tool.name} must not duplicate requirements`);
}

const topology = tools.find((tool) => tool.name === 'genos_topology_session');
const mergedTopology = mergeSchema(contract.getFullToolSchema(topology.name), topology.inputSchema);
assert.ok(mergedTopology.properties.needs);
assert.ok(mergedTopology.properties.operation.enum.includes('evaluate_merge'));
