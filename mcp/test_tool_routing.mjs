import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createToolCallHandler, filterRoutableTools } from './toolCallHandler.js';
import { loadToolCatalog } from './catalog.js';
import { resolveRepoRoot } from './repoRoot.js';

const require = createRequire(import.meta.url);
const capabilityMatrix = require('../backend/src/services/capabilityAccessMatrix');
const catalog = loadToolCatalog(resolveRepoRoot());
const contract = require('../backend/src/services/mcpContract.js');
const resolvedCatalog = catalog.map((tool) => ({
  ...tool,
  inputSchema: contract.getToolInputSchema(tool.name, tool.inputSchema)
}));
const routable = filterRoutableTools(resolvedCatalog);
const routableNames = new Set(routable.map((tool) => tool.name));
assert.ok(routableNames.has('genos_philosophy'));
assert.ok(routableNames.has('genos_fossil_record'));
assert.ok(routableNames.has('genos_topology_session'));
assert.ok(routableNames.has('genos_signal_publish'));
assert.ok(routable.length === catalog.length, 'every canonical tool must have a verified Node route');
assert.ok(routable.every((tool) => typeof tool.inputSchema === 'object'));
for (const name of capabilityMatrix.ROUTABLE_TOOLS) {
  assert.ok(routableNames.has(name), `${name} must be present in the MCP router output`);
}
for (const capability of capabilityMatrix.fullMatrix()) {
  if (capability.level !== capabilityMatrix.ACCESS_MCP_TOOL) continue;
  assert.deepEqual(capability.missingFromCatalog, [], `${capability.capability} catalog coverage`);
  assert.deepEqual(capability.missingRoutes, [], `${capability.capability} call route coverage`);
}

const handler = createToolCallHandler({
  runOrchestrator: async () => { throw new Error('unexpected orchestrator call'); },
  runGenosCli: async () => { throw new Error('unexpected CLI call'); },
  executeStrategyTool: async () => { throw new Error('unexpected strategy call'); }
});
const rejected = await handler({ params: { name: 'genos_not_catalogued', arguments: {} } });
assert.equal(rejected.isError, true);
assert.match(rejected.content[0].text, /no verified MCP route/);

for (const tool of routable) {
  const resolved = contract.getToolInputSchema(tool.name, tool.inputSchema);
  assert.equal(resolved.type, 'object', `${tool.name} must resolve to an object schema`);
  for (const property of Object.keys(tool.inputSchema.properties || {})) {
    assert.ok(resolved.properties[property], `${tool.name} must retain schema property ${property}`);
  }
  for (const required of tool.inputSchema.required || []) {
    assert.ok(resolved.required.includes(required) || resolved.anyOf?.some((choice) => choice.required?.includes(required)),
      `${tool.name} must retain required field ${required}`);
  }
}

console.log(`MCP routing checks passed (${routable.length}/${catalog.length} tools routable).`);
