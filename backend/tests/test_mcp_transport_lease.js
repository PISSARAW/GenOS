const assert = require('node:assert/strict');
const executor = require('../src/services/mcpExecutor');
const dispatch = require('../src/services/mcpExecutor/dispatch');
const permissionBridge = require('../src/services/mcpExecutor/permissionMembraneBridge');

const previous = process.env.GENOS_MCP_LEASE;
process.env.GENOS_MCP_LEASE = 'genos_snapshot';
assert.equal(executor.directToolLeaseAllows('genos_snapshot'), true);
assert.equal(executor.directToolLeaseAllows('genos_replay'), false);
const authority = { status: 'authorized', hash: 'authority-hash', envelope: {
  runId: 'run-1', missionId: 'mission-1',
  scope: { organizationId: 'org-1', projectId: 'project-1', entityId: 'agent-1' },
  toolLease: ['genos_replay']
} };
const leaseInput = permissionBridge.permissionInput({ request: {
  agentId: 'agent-1', runId: 'run-1', toolName: 'genos_replay', args: { snapshot: 's' }
}, policy: { decision: 'allow' }, binding: authority });
assert.deepEqual(leaseInput.lease.tools, ['genos_replay'],
  'A valid signed mission lease must not be narrowed by another process lease.');
const authorizedValidation = dispatch.preValidateTool({ registry: { isSupportedTool: () => true },
  toolName: 'genos_replay', args: { snapshot: 's' }, executionKind: 'local',
  authorityLease: ['genos_replay'] });
assert.equal(authorizedValidation, null,
  'Bound dispatch must validate against the signed mission lease.');
const unboundValidation = dispatch.preValidateTool({ registry: { isSupportedTool: () => true },
  toolName: 'genos_replay', args: { snapshot: 's' }, executionKind: 'local' });
assert.equal(unboundValidation.status, 'lease_denied',
  'Unbound dispatch remains constrained by the process lease.');
if (previous === undefined) delete process.env.GENOS_MCP_LEASE; else process.env.GENOS_MCP_LEASE = previous;
console.log('MCP transport lease policy is shared by HTTP and direct execution.');
