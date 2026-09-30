'use strict';

const assert = require('node:assert/strict');
const {
  biologicalFeatureLeaseScope,
  directBiologicalFeatureLeaseAllows
} = require('../src/services/mcpExecutor/config');
const { preValidateTool } = require('../src/services/mcpExecutor/dispatch');

const previousLease = process.env.GENOS_MCP_LEASE;
const previousDisabled = process.env.GENOS_MCP_DISABLED_TOOLS;
const previousExposeAll = process.env.GENOS_MCP_EXPOSE_ALL;
const previousNodeEnv = process.env.NODE_ENV;

try {
  process.env.GENOS_MCP_LEASE = 'genos_biomimicry';
  delete process.env.GENOS_MCP_DISABLED_TOOLS;
  const call = { feature: 'electric_organ', action: 'discharge' };
  assert.equal(biologicalFeatureLeaseScope(call), 'genos_biomimicry::electrocyte::discharge');
  assert.equal(directBiologicalFeatureLeaseAllows(call), false, 'generic lease alone must not authorize a specialized action');
  const registry = { isSupportedTool: () => true };
  assert.equal(preValidateTool({ registry, toolName: 'genos_biomimicry', args: call, executionKind: 'cli' }).code, 'MCP_BIOLOGICAL_CAPABILITY_LEASE_DENIED');
  assert.equal(preValidateTool({ registry, toolName: 'genos_biomimicry', args: { feature: 'unknown', action: 'run' }, executionKind: 'cli' }).code, 'MCP_BIOLOGICAL_CAPABILITY_LEASE_DENIED', 'unknown feature names cannot fall back to the broad tool lease');

  process.env.GENOS_MCP_LEASE = 'genos_biomimicry,genos_biomimicry::electrocyte::discharge';
  assert.equal(directBiologicalFeatureLeaseAllows(call), true, 'explicit feature/action scope grants the call');
  assert.equal(preValidateTool({ registry, toolName: 'genos_biomimicry', args: call, executionKind: 'cli' }), null);
  assert.equal(directBiologicalFeatureLeaseAllows({ feature: 'electrocyte', action: 'recharge' }), false, 'a different action requires a different scope');

  process.env.GENOS_MCP_LEASE += ',genos_biomimicry::electrocyte::recharge';
  process.env.GENOS_MCP_DISABLED_TOOLS = 'genos_biomimicry::electrocyte::recharge';
  assert.equal(directBiologicalFeatureLeaseAllows({ feature: 'electrocyte', action: 'recharge' }), false, 'disabled capability scope overrides a grant');
  assert.equal(biologicalFeatureLeaseScope({ feature: 'unknown', action: 'run' }), 'genos_biomimicry::unknown::run');

  const capabilities = [
    ['choanocyte', 'sift'], ['iridophore', 'render'], ['guard_cell', 'throttle'],
    ['tracheid', 'transport'], ['prokaryote', 'conjugate']
  ];
  for (const [feature, action] of capabilities) {
    const scopedCall = { feature, action };
    const scope = biologicalFeatureLeaseScope(scopedCall);
    process.env.GENOS_MCP_LEASE = `genos_biomimicry,${scope}`;
    delete process.env.GENOS_MCP_DISABLED_TOOLS;
    assert.equal(preValidateTool({ registry, toolName: 'genos_biomimicry', args: scopedCall, executionKind: 'cli' }), null, `${scope} should authorize only its operation`);
  }
  delete process.env.GENOS_MCP_LEASE;
  process.env.NODE_ENV = 'test';
  process.env.GENOS_MCP_EXPOSE_ALL = 'true';
  const exposedCall = { feature: 'choanocyte', action: 'sift' };
  assert.equal(directBiologicalFeatureLeaseAllows(exposedCall), true, 'explicit nonproduction expose-all remains supported');
  process.env.GENOS_MCP_DISABLED_TOOLS = biologicalFeatureLeaseScope(exposedCall);
  assert.equal(directBiologicalFeatureLeaseAllows(exposedCall), false, 'disabled scopes override expose-all');
} finally {
  if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
  else process.env.GENOS_MCP_LEASE = previousLease;
  if (previousDisabled === undefined) delete process.env.GENOS_MCP_DISABLED_TOOLS;
  else process.env.GENOS_MCP_DISABLED_TOOLS = previousDisabled;
  if (previousExposeAll === undefined) delete process.env.GENOS_MCP_EXPOSE_ALL;
  else process.env.GENOS_MCP_EXPOSE_ALL = previousExposeAll;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
}

console.log('Biomimetic feature/action leases fail closed and honor disabled scopes.');
