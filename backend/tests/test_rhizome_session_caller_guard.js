'use strict';

const assert = require('node:assert/strict');
const { guardRhizomeCall } = require('../src/services/rhizome/rhizomeSessionCallerGuard');

function dbFor(agent, children = []) {
  return {
    get: async (sql) => sql.includes('FROM agents') ? agent : { id: agent.workspace_id, organization_id: 'org', project_id: 'project' },
    all: async () => children
  };
}

async function main() {
  const record = { id: 'rhizome-A', topology: 'rhizome', state: { rhizomeId: 'rhizome-A' } };
  const foreignWorker = { id: 'agent-B', workspace_id: 'workspace-B', execution_mode: 'worker',
    metadata_json: JSON.stringify({ topologySessionId: 'rhizome-B' }) };
  await assert.rejects(guardRhizomeCall(dbFor(foreignWorker), record, { agentId: 'agent-B' }),
    (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  const member = { ...foreignWorker, id: 'agent-A', workspace_id: 'workspace-A',
    metadata_json: JSON.stringify({ topologySessionId: 'rhizome-A' }) };
  await guardRhizomeCall(dbFor(member), record, { agentId: 'agent-A', organizationId: 'org', projectId: 'project' });
  await assert.rejects(guardRhizomeCall(dbFor(member), record, { agentId: 'agent-A', organizationId: 'other', projectId: 'project' }),
    (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  await assert.rejects(guardRhizomeCall(dbFor(member), record, {}),
    (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  console.log('Rhizome caller identity, session membership, tenant scope and missing identity denied.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
