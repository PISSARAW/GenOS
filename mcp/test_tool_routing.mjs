import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createToolCallHandler, filterRoutableTools, isToolCallRoutable } from './toolCallHandler.js';
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
for (const name of ['genos_optimal_foraging', 'genos_foveal_crop', 'genos_computer_use']) {
  assert.ok(routableNames.has(name), `${name} must use its backend registry route`);
}
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
assert.equal(isToolCallRoutable('genos_not_catalogued'), false);
const previousLease = process.env.GENOS_MCP_LEASE;
process.env.GENOS_MCP_LEASE = '';
const leaseDenied = await handler({ params: { name: 'genos_signal_publish', arguments: { signal_type: 'ligand' } } });
if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
else process.env.GENOS_MCP_LEASE = previousLease;
assert.equal(leaseDenied.isError, true);
assert.match(leaseDenied.content[0].text, /outside the active GenOS MCP lease/);

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

const failedCli = createToolCallHandler({
  runOrchestrator: async () => '',
  runGenosCli: async () => JSON.stringify({ success: false, status: 'capability_unavailable', error: 'No verified snapshot.' }),
  executeStrategyTool: async () => null
});
const failedOrchestrator = createToolCallHandler({
  runOrchestrator: async () => JSON.stringify({ success: false, error: 'No authorized organization change.' }),
  runGenosCli: async () => '',
  executeStrategyTool: async () => null
});
process.env.GENOS_MCP_LEASE = 'genos_snapshot';
try {
  const response = await failedCli({ params: { name: 'genos_snapshot', arguments: { agent: 'agent.json', out: 'snapshot.json' } } });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /No verified snapshot/);
} finally {
  if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
  else process.env.GENOS_MCP_LEASE = previousLease;
}
process.env.GENOS_MCP_LEASE = 'genos_change_organization';
try {
  const response = await failedOrchestrator({ params: { name: 'genos_change_organization', arguments: {
    organization: 'specialist_expert_committee' } } });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /No authorized organization change/);
  const accepted = createToolCallHandler({
    runOrchestrator: async () => JSON.stringify({ status: 'accepted', missionId: 'queued-test' }),
    runGenosCli: async () => '', executeStrategyTool: async () => null
  });
  const queued = await accepted({ params: { name: 'genos_change_organization', arguments: {
    organization: 'specialist_expert_committee' } } });
  assert.notEqual(queued.isError, true);
  assert.equal(JSON.parse(queued.content[0].text).status, 'accepted');
} finally {
  if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
  else process.env.GENOS_MCP_LEASE = previousLease;
}
