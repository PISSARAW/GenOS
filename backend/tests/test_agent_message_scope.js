const assert = require('node:assert/strict');
const { test } = require('node:test');
const organization = require('../src/services/dynamicOrganizationService');
const { getDatabase, closeDatabase } = require('../src/db');

async function seedTenant(db, suffix) {
  await db.run('INSERT INTO organizations(id,name) VALUES (?,?)', `org-${suffix}`, suffix);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES (?,?,?)', `project-${suffix}`, `org-${suffix}`, suffix);
  await db.run('INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    `ws-${suffix}`, suffix, `/memory-${suffix}`, `org-${suffix}`, `project-${suffix}`);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id) VALUES (?,?,'orchestrator','running','orchestrator',?)",
    `orch-${suffix}`, suffix, `ws-${suffix}`);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id) VALUES (?,?,'reviewer','running','worker',?,?)",
    `worker-${suffix}`, suffix, `orch-${suffix}`, `ws-${suffix}`);
}

test('organization messages persist exact tenant scope and remain isolated after transitions', async () => {
  process.env.GENOS_ADMIN_PASSWORD ||= 'organization-scope-test-only';
  const db = await getDatabase(':memory:');
  try {
    await seedTenant(db, 'a');
    await seedTenant(db, 'b');
    const sent = await organization.publish(db, { orchestratorId: 'orch-a', senderAgentId: 'worker-a',
      kind: 'evidence', signalType: 'ligand', signalData: { evidence: 'scoped' } });
    const row = await db.get('SELECT organization_id, project_id FROM agent_organization_messages WHERE id = ?', sent.id);
    assert.deepEqual(row, { organization_id: 'org-a', project_id: 'project-a' });
    await organization.changeOrganization(db, { orchestratorId: 'orch-a', organization: 'cross_functional_pod' });
    const local = await organization.inbox(db, { orchestratorId: 'orch-a', requesterAgentId: 'orch-a' });
    assert.equal(local.messages[0].id, sent.id);
    const other = await organization.inbox(db, { orchestratorId: 'orch-b', requesterAgentId: 'orch-b' });
    assert.equal(other.messages.length, 0);
    await assert.rejects(organization.inbox(db, { orchestratorId: 'orch-a', requesterAgentId: 'worker-b' }),
      { code: 'ORGANIZATION_ACCESS_DENIED' });
  } finally { await closeDatabase(); }
});
