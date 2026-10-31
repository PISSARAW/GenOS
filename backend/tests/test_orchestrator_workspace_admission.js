'use strict';

const assert = require('node:assert/strict');
const { requireMissionWorkspace } = require('../bin/missionWorkspaceScope.cjs');
const { initializeMission } = require('../bin/orchestratorMissionInitialization.cjs');

async function main() {
  const originalRoot = process.env.GENOS_WORKSPACE_ROOT;
  delete process.env.GENOS_WORKSPACE_ROOT;
  const workspace = { id: 'ws-scope', path: 'C:\\GenOS',
    organization_id: 'org-test', project_id: 'project-test' };
  let lookups = 0;
  const db = {
    async run() {
      throw new Error('unscoped admission must stop before creating an agent');
    },
    async get(_sql, id) {
      lookups += 1;
      return id === workspace.id ? workspace : null;
    }
  };
  try {
    await assert.rejects(requireMissionWorkspace(db, {}),
      { code: 'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED' });
    await assert.rejects(initializeMission({ db, action: 'orchestrate', orchestratorId: 'agent',
      task: 'observe', request: {} }), { code: 'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED' });
    assert.equal(lookups, 0, 'missing workspace must be rejected without registry writes');
    assert.equal(await requireMissionWorkspace(db, { workspaceId: workspace.id }), workspace);
  } finally {
    if (originalRoot === undefined) delete process.env.GENOS_WORKSPACE_ROOT;
    else process.env.GENOS_WORKSPACE_ROOT = originalRoot;
  }
  console.log('Orchestrator workspace admission: tenant scope is required before mission creation.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
