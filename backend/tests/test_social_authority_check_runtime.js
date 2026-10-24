'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-authority-check-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const authority = require('../src/services/socialAuthorityCheckRuntimeService');

const scope = { organizationId: 'authority-org', projectId: 'authority-project',
  subjectAgentIds: ['agent-a', 'agent-b'], arm: 'baseline', seed: 'seed-1' };

async function begin(db, checkId) {
  return authority.beginSocialAuthorityCheck(db, { ...scope, checkId });
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    const baseline = await begin(db, 'check-no-change');
    assert.equal(baseline.readBack, true);
    const unchanged = await authority.completeSocialAuthorityCheck(db, { checkId: 'check-no-change' });
    assert.equal(unchanged.valid, true);
    assert.equal(unchanged.artifact.noProtectedMutations, true);
    assert.equal(unchanged.artifact.permissionPolicyUnchanged, true);
    assert.equal(unchanged.artifact.proposalsOnly, true);
    assert.equal(unchanged.artifact.permissionPolicyHash, unchanged.artifact.permissionPolicyHashAfter);

    await begin(db, 'check-action-change');
    await db.run(`INSERT INTO body_action_receipts
      (action_id,agent_id,mission_id,run_id,effector_id,authority_hash,prediction_json,phase)
      VALUES(?,?,?,?,?,?,?,?)`, 'action-1', 'agent-a', 'mission-a', 'run-a', 'hand', 'authority-hash', '{}', 'predicted');
    const changed = await authority.completeSocialAuthorityCheck(db, { checkId: 'check-action-change' });
    assert.equal(changed.valid, false);
    assert.equal(changed.artifact.noProtectedMutations, false);

    await begin(db, 'check-permission-change');
    await db.run(`INSERT INTO agent_permissions(agent_id,permissions_json,denied_tools_json,organization_id,project_id)
      VALUES(?,?,?,?,?) ON CONFLICT(agent_id,organization_id,project_id) DO UPDATE SET permissions_json=excluded.permissions_json`,
    'agent-a', '["proposal"]', '[]', scope.organizationId, scope.projectId);
    const policyChanged = await authority.completeSocialAuthorityCheck(db, { checkId: 'check-permission-change' });
    assert.equal(policyChanged.artifact.permissionPolicyUnchanged, false);
    assert.equal(policyChanged.valid, false);
    console.log('Social authority check: DB readback detects action and permission mutations; no-op remains proposal-only.');
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
