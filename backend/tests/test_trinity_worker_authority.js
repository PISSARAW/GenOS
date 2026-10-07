'use strict';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const authority = require('../src/services/agentAuthorityService');

async function main() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'trinity-authority-test-only';
  const db = await getDatabase(':memory:');
  try {
    await db.run("INSERT INTO organizations (id,name) VALUES ('org','Test org')");
    await db.run("INSERT INTO organizations (id,name) VALUES ('foreign','Foreign org')");
    await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('project','org','Test project')");
    await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('foreign','foreign','Foreign project')");
    await db.run("INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES ('parent-ws','Parent','parent','org','project')");
    await db.run("INSERT INTO workspaces (id,name,path,visibility,organization_id,project_id) VALUES ('trinity_workspace_worker','World','private','Private','org','project')");
    await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('parent','Parent','orchestrator','idle','orchestrator','parent-ws')");
    await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,parent_agent_id) VALUES ('worker','World','implementation','idle','worker','trinity_workspace_worker','parent')");
    await db.run(`INSERT INTO trinity_experiments (id,mission_id,domain,mission_snapshot_hash,design_json,isolation_policy_json,budget_policy_json,status)
      VALUES ('experiment','mission','software','hash','{"orchestratorId":"parent"}','{}','{}','sealed_running')`);
    await db.run("INSERT INTO trinity_worlds (id,mission,world_number,name,strategy,status,agent_id,experiment_id,workspace_root,snapshot_hash) VALUES ('world','mission',1,'World','direct','running','worker','experiment','private','hash')");
    const launch = () => authority.authorizeMission(db, { agentId: 'worker', orchestratorAgentId: 'parent', workspaceId: 'trinity_workspace_worker' });
    assert.equal((await launch()).id, 'worker');
    const garageScope = () => require('../src/services/garageRequests').scope(db, { workerId: 'worker', orchestratorId: 'parent' });
    assert.equal((await garageScope()).workspace_id, 'trinity_workspace_worker');
    const mutations = [
      ["UPDATE workspaces SET organization_id='foreign',project_id='foreign' WHERE id='trinity_workspace_worker'", "UPDATE workspaces SET organization_id='org',project_id='project' WHERE id='trinity_workspace_worker'"],
      ["UPDATE workspaces SET path='other' WHERE id='trinity_workspace_worker'", "UPDATE workspaces SET path='private' WHERE id='trinity_workspace_worker'"],
      ["UPDATE workspaces SET visibility='Public' WHERE id='trinity_workspace_worker'", "UPDATE workspaces SET visibility='Private' WHERE id='trinity_workspace_worker'"],
      ["UPDATE trinity_worlds SET snapshot_hash='other'", "UPDATE trinity_worlds SET snapshot_hash='hash'"],
      ["UPDATE trinity_experiments SET status='decided'", "UPDATE trinity_experiments SET status='sealed_running'"],
      ["UPDATE trinity_experiments SET design_json='{}'", `UPDATE trinity_experiments SET design_json='{"orchestratorId":"parent"}'`]
    ];
    for (const [mutate, restore] of mutations) {
      await db.run(mutate);
      await assert.rejects(launch, { code: 'ORCHESTRATOR_WORKSPACE_MISMATCH' });
      await assert.rejects(garageScope, { code: 'GARAGE_SCOPE_INVALID' });
      await db.run(restore);
    }
    await assert.rejects(() => authority.authorizeMission(db, { agentId: 'worker', orchestratorAgentId: 'wrong-parent' }), { code: 'WORKER_ORCHESTRATOR_MISMATCH' });
    await db.run("UPDATE agents SET workspace_id=NULL WHERE id='parent'");
    await assert.rejects(launch, { code: 'ORCHESTRATOR_WORKSPACE_MISMATCH' });
    await db.run("UPDATE workspaces SET organization_id=NULL,project_id=NULL WHERE id='trinity_workspace_worker'");
    assert.equal((await launch()).id, 'worker');
    await db.run("UPDATE agents SET workspace_id='parent-ws' WHERE id='parent'");
    await db.run("UPDATE workspaces SET organization_id='org',project_id='project' WHERE id='trinity_workspace_worker'");
    await db.run("UPDATE agents SET metadata_json='{\"sealedDispatchParentId\":\"parent\"}' WHERE id='worker'");
    await db.run("DELETE FROM trinity_worlds");
    await assert.rejects(launch, { code: 'ORCHESTRATOR_WORKSPACE_MISMATCH' });
    console.log('Trinity sealed worker delegation and tampering refusals: PASS');
  } finally { await closeDatabase(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
