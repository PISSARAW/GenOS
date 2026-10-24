'use strict';

const assert = require('node:assert/strict');
const { compareIdentity, compareCapabilities, summarizeRuns, forkScope } = require('../src/services/agentGitService/ontogeneticOps.cjs');

assert.deepEqual(compareIdentity({ name: 'A', role: 'worker' }, { name: 'A', role: 'reviewer' }), {
  stable: false, changedFields: ['role']
});
assert.deepEqual(compareCapabilities([{ plasmid_id: 'a' }, { plasmid_id: 'b' }], [{ plasmid_id: 'b' }, { plasmid_id: 'c' }]), {
  preservedPlasmids: ['b'], lostPlasmids: ['a'], acquiredPlasmids: ['c']
});
assert.deepEqual(summarizeRuns([
  { status: 'completed', budget_json: '{"consumed":4}' },
  { status: 'failed', budget_json: '{"consumed":2}' }
]), { count: 2, statuses: { completed: 1, failed: 1 }, budgetConsumed: 6 });
const envKeys = ['GENOS_MCP_ALLOW_AGENT_FORK', 'GENOS_MCP_AGENT_ID', 'GENOS_MCP_FORK_ROOT', 'GENOS_MCP_ORGANIZATION_ID', 'GENOS_MCP_PROJECT_ID'];
const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
Object.assign(process.env, {
  GENOS_MCP_ALLOW_AGENT_FORK: 'true', GENOS_MCP_AGENT_ID: 'agent-1', GENOS_MCP_FORK_ROOT: 'D:\\forks',
  GENOS_MCP_ORGANIZATION_ID: 'org-1', GENOS_MCP_PROJECT_ID: 'project-1'
});
assert.equal(forkScope({ body: { agentId: 'agent-1' }, tenant: { organizationId: 'org-1', projectId: 'project-1' } }).allowed, true);
assert.equal(forkScope({ body: { agentId: 'agent-2' }, tenant: { organizationId: 'org-1', projectId: 'project-1' } }).allowed, false);
for (const key of envKeys) {
  if (previous[key] === undefined) delete process.env[key];
  else process.env[key] = previous[key];
}
console.log('AgentGit ontogenetic comparison passed.');
