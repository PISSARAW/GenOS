/**
 * Point #8 — approbations : bypass de séparation keyId/username, TOCTOU
 * approve→execute, permissions payload et compatibilité des lignes legacy.
 *
 * Scénarios couverts contre backend/src/controllers/platformController.js :
 * 1. même identité exacte (keyId) des deux côtés → 409 SEPARATION ;
 * 2. contournement cross-forme : requested_by == username du décideur alors
 *    que decisionBy (keyId) diffère → 409 SEPARATION (l'ancien `===` seul
 *    laissait passer) ;
 * 3. décideur disjoint → décision acceptée, statut approved ;
 * 4. payload modifié après création → 409 TAMPERED, statut reste pending ;
 * 5. ligne legacy sans payload_hash (writer mcpController) → décision OK,
 *    hash lié au moment du flip ;
 * 6. re-vérification post-flip : executeApprovedAction bloque sur hash
 *    divergent (statut approved conservé + audit 'blocked') ;
 * 7. resolveApprovalPermissions : payload non-vide respecté, sinon ['*'].
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password-approval-bypass';

const { getDatabase, closeDatabase } = require('../src/db');
const platformController = require('../src/controllers/platformController');
const approvalExecution = require('../src/services/platformApprovalExecution');
const approvalPolicy = require('../src/services/platformApprovalPolicy');

const TENANT = { organizationId: 'org-bypass', projectId: 'proj-bypass' };

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: (code) => { res.statusCode = code; return res; },
    json: (data) => { res.body = data; return res; }
  };
  return res;
}

function mockReq(overrides) {
  return { tenant: TENANT, params: {}, body: {}, user: null, ...overrides };
}

async function createApproval(db, user, body) {
  const res = mockRes();
  await platformController.approvals(mockReq({ method: 'POST', body, user }), res, (error) => { throw error; });
  assert.equal(res.statusCode, 201);
  return res.body;
}

async function decideApproval(db, request) {
  const res = mockRes();
  await platformController.decideApproval(
    mockReq({ params: { id: request.id }, body: { decision: request.decision }, user: request.user }),
    res,
    (error) => { throw error; }
  );
  return res;
}

async function statusOf(db, id) {
  const row = await db.get('SELECT status FROM platform_approvals WHERE id = ?', id);
  return row.status;
}

async function run() {
  const dbPath = path.resolve(__dirname, 'test-approval-separation-bypass.db');
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
  }
  const db = await getDatabase(dbPath);
  try {
    // 1. Identité exacte des deux côtés → rejet.
    const same = await createApproval(db, { keyId: 'key-alice', username: 'alice' }, { action: 'review', agentId: 'agent-1' });
    const sameRes = await decideApproval(db, { id: same.id, user: { keyId: 'key-alice', username: 'alice' }, decision: 'approve' });
    assert.equal(sameRes.statusCode, 409);
    assert.equal(sameRes.body.error.code, 'APPROVAL_SEPARATION_REQUIRED');
    assert.equal(await statusOf(db, same.id), 'pending');

    // 2. Bypass cross-forme : même humain, keyId à la création, username à la décision.
    const cross = await createApproval(db, { keyId: 'shared-id-7', username: 'requester' }, { action: 'review', agentId: 'agent-1' });
    assert.equal(cross.requested_by, undefined);
    const stored = await db.get('SELECT requested_by FROM platform_approvals WHERE id = ?', cross.id);
    assert.equal(stored.requested_by, 'shared-id-7');
    const crossRes = await decideApproval(db, { id: cross.id, user: { keyId: 'other-key', username: 'shared-id-7' }, decision: 'approve' });
    assert.equal(crossRes.statusCode, 409);
    assert.equal(crossRes.body.error.code, 'APPROVAL_SEPARATION_REQUIRED');
    assert.equal(await statusOf(db, cross.id), 'pending');

    // 3. Décideur disjoint → décision acceptée.
    const legit = await createApproval(db, { keyId: 'key-alice', username: 'alice' }, { action: 'review', agentId: 'agent-1' });
    const legitRes = await decideApproval(db, { id: legit.id, user: { keyId: 'key-bob', username: 'bob' }, decision: 'approve' });
    assert.equal(legitRes.statusCode, 200);
    assert.equal(legitRes.body.status, 'approved');
    assert.equal(await statusOf(db, legit.id), 'approved');
    const doubleRes = await decideApproval(db, { id: legit.id, user: { keyId: 'key-carol', username: 'carol' }, decision: 'approve' });
    assert.equal(doubleRes.statusCode, 409);
    assert.equal(doubleRes.body.error.code, 'APPROVAL_ALREADY_DECIDED');

    // 4. Payload modifié après création → 409 TAMPERED avant flip.
    const tampered = await createApproval(db, { keyId: 'key-alice', username: 'alice' }, { action: 'review', agentId: 'agent-1' });
    await db.run('UPDATE platform_approvals SET payload_json = ? WHERE id = ?', JSON.stringify({ action: 'review', agentId: 'agent-1', injected: true }), tampered.id);
    const tamperedRes = await decideApproval(db, { id: tampered.id, user: { keyId: 'key-bob', username: 'bob' }, decision: 'approve' });
    assert.equal(tamperedRes.statusCode, 409);
    assert.equal(tamperedRes.body.error.code, 'APPROVAL_PAYLOAD_TAMPERED');
    assert.equal(await statusOf(db, tampered.id), 'pending');

    // 5. Ligne legacy sans payload_hash (writer type mcpController) → OK, hash lié au flip.
    const legacyId = 'approval-legacy-1';
    await db.run(
      'INSERT INTO platform_approvals (id, action, agent_id, risk, uncertainty, requested_by, organization_id, project_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      legacyId, 'review', 'agent-1', 'high', 0.5, 'legacy-requester', TENANT.organizationId, TENANT.projectId, JSON.stringify({ action: 'review' })
    );
    const legacyRes = await decideApproval(db, { id: legacyId, user: { keyId: 'key-bob', username: 'bob' }, decision: 'approve' });
    assert.equal(legacyRes.statusCode, 200);
    assert.equal(legacyRes.body.status, 'approved');
    const bound = await db.get('SELECT payload_hash FROM platform_approvals WHERE id = ?', legacyId);
    assert.match(bound.payload_hash, /^[a-f0-9]{64}$/);

    // 6. TOCTOU post-flip : hash lié ≠ payload relu → exécution bloquée, statut approved conservé.
    const toolId = 'approval-tool-1';
    const toolPayload = { toolName: 'no_such_tool_for_bypass_test', args: {} };
    const toolHash = approvalPolicy.hashPayload(JSON.stringify(toolPayload));
    await db.run(
      'INSERT INTO platform_approvals (id, action, agent_id, risk, uncertainty, status, requested_by, decision_by, organization_id, project_id, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      toolId, 'tool:no_such_tool_for_bypass_test', 'agent-1', 'high', 0.5, 'approved', 'alice', 'bob',
      TENANT.organizationId, TENANT.projectId, JSON.stringify({ toolName: 'no_such_tool_for_bypass_test', args: {}, smuggled: true }), toolHash
    );
    const toolRow = await db.get('SELECT * FROM platform_approvals WHERE id = ?', toolId);
    const blocked = await approvalExecution.executeApprovedAction(db, toolRow, { status: 'approved', actor: 'bob' });
    assert.equal(blocked.success, false);
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.code, 'APPROVAL_PAYLOAD_TAMPERED');
    assert.equal(await statusOf(db, toolId), 'approved');
    const audits = await db.all("SELECT decision, reason FROM audit_logs WHERE action = 'APPROVED_TOOL_EXECUTION' AND resource = ?", 'no_such_tool_for_bypass_test');
    assert(audits.some((entry) => entry.decision === 'blocked'));

    // 7. Permissions : payload respecté, fallback ['*'] sinon.
    assert.deepEqual(approvalPolicy.resolveApprovalPermissions({ permissions: ['tool:execute'] }), ['tool:execute']);
    assert.deepEqual(approvalPolicy.resolveApprovalPermissions({}), ['*']);
    assert.deepEqual(approvalPolicy.resolveApprovalPermissions({ permissions: [] }), ['*']);
    assert.deepEqual(approvalPolicy.resolveApprovalPermissions(null), ['*']);

    console.log('Approval separation bypass checks passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

run().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
