'use strict';

function createAdditionalSignalPlaneCases(context) {
  const { testDb, resetState, transport, receptor, assert } = context;

  async function testScopedReadCannotStealDelivery() {
    resetState();
    await testDb.run("INSERT INTO organizations (id, name) VALUES ('org-other', 'Other Org')");
    await testDb.run("INSERT INTO projects (id, organization_id, name) VALUES ('proj-other', 'org-other', 'Other Project')");
    await testDb.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('ws-other', 'Other', '/tmp/other', 'org-other', 'proj-other')");
    await testDb.run("INSERT INTO agents (id, name, role, execution_mode, workspace_id) VALUES ('worker-outside', 'Outside', 'worker', 'worker', 'ws-other')");
    const broadcast = await transport.publishSignal({
      signalType: 'ligand', signalData: { semanticType: 'SCOPED_READ' },
      senderAgentId: 'orch-1'
    });
    assert.equal((await transport.readSignalsForAgent('worker-outside')).length, 0);
    assert.ok((await transport.readSignalsForAgent('worker-1')).some(s => s.signalId === broadcast.signalId));
    receptor.registerReceptor({
      id: 'receptor-pending-read', targetLigand: 'PENDING_READ',
      threshold: 0.5, action: 'update_agent',
      actionData: { agentId: 'worker-1', status: 'running' }
    });
    assert.equal(await transport.subscribeAgent(testDb, 'worker-1', 'pending-read-test'), true);
    const pending = await transport.publishSignal({
      signalType: 'ligand', signalData: { semanticType: 'PENDING_READ' },
      topic: 'pending-read-test', senderAgentId: 'orch-1', recipientAgentIds: ['worker-1']
    });
    const beforeSeen = await testDb.get('SELECT status FROM signal_deliveries WHERE signal_id = ?', pending.signalId);
    assert.equal(beforeSeen?.status, 'pending');
    assert.ok(!(await transport.readSignalsForAgent('worker-1')).some(s => s.signalId === pending.signalId));
    await transport.markSignalsSeen('worker-1', [pending.signalId]);
    const row = await testDb.get('SELECT status FROM signal_deliveries WHERE signal_id = ?', pending.signalId);
    assert.equal(row.status, 'pending');
    await testDb.run("INSERT INTO workspaces (id, name, path, organization_id) VALUES ('ws-partial', 'Partial', '/tmp/partial', 'org-test')");
    await testDb.run("INSERT INTO agents (id, name, role, execution_mode, workspace_id) VALUES ('orch-partial', 'Partial', 'orchestrator', 'orchestrator', 'ws-partial')");
    const rejected = await transport.publishSignal({
      signalType: 'ligand', signalData: { semanticType: 'PARTIAL_SCOPE' },
      topic: 'partial-scope', senderAgentId: 'orch-partial', recipientAgentIds: ['worker-1']
    });
    assert.equal(rejected.published, false);
    assert.equal(rejected.routing.routingMode, 'scope_mismatch');
    assert.equal(await testDb.get('SELECT signal_id FROM signal_blobs WHERE signal_id = ?', rejected.signalId), undefined);
    console.log('[PASS] testScopedReadCannotStealDelivery');
  }

  async function testRejectedRecipientIsNotPersisted() {
    resetState();
    await testDb.run(`INSERT INTO projects (id, organization_id, name) VALUES ('proj-remote', 'org-test', 'Other Project')`);
    await testDb.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
      VALUES ('ws-remote', 'Other Workspace', '/tmp/other', 'org-test', 'proj-remote')`);
    await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id)
      VALUES ('worker-remote', 'Other Worker', 'worker', 'active', 'worker', 'ws-remote', 'orch-1')`);
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'TEST_READY', concentration: 1 },
      topic: 'scope-rejected', senderAgentId: 'orch-1', recipientAgentIds: ['worker-remote'] });
    assert.equal(result.published, false);
    assert.equal(result.suppressedBy, 'recipient_scope');
    const row = await testDb.get('SELECT signal_id FROM signal_blobs WHERE signal_id = ?', result.signalId);
    assert.equal(row, undefined);
    console.log('[PASS] testRejectedRecipientIsNotPersisted');
  }

  async function testReadRespectsProjectScope() {
    resetState();
    await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
      VALUES ('orch-remote', 'Other Orchestrator', 'orchestrator', 'idle', 'orchestrator', 'ws-remote')`);
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'OTHER_PROJECT', concentration: 0.9 },
      senderAgentId: 'orch-remote' });
    assert.equal(result.published, true);
    const own = await transport.readSignalsForAgent('worker-remote');
    const foreign = await transport.readSignalsForAgent('worker-1');
    assert.ok(own.some((signal) => signal.signalId === result.signalId));
    assert.ok(!foreign.some((signal) => signal.signalId === result.signalId));
    console.log('[PASS] testReadRespectsProjectScope');
  }

  async function testReceptorCannotUpdateOtherProject() {
    resetState();
    receptor.registerReceptor({ id: 'foreign-update', targetLigand: 'FOREIGN_UPDATE',
      threshold: 0.5, action: 'update_agent',
      actionData: { agentId: 'worker-remote', status: 'completed' } });
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'FOREIGN_UPDATE', concentration: 1 },
      topic: 'foreign-update', senderAgentId: 'orch-1' });
    const target = await testDb.get('SELECT status FROM agents WHERE id = ?', ['worker-remote']);
    assert.equal(result.published, true);
    assert.equal(result.llmRequired, true);
    assert.equal(target.status, 'active');
    console.log('[PASS] testReceptorCannotUpdateOtherProject');
  }

  async function testReadRespectsTargetedAudience() {
    resetState();
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'PRIVATE_TARGET', concentration: 0.9 },
      senderAgentId: 'orch-1', recipientAgentIds: ['worker-1'] });
    assert.equal(result.published, true);
    const target = await transport.readSignalsForAgent('worker-1');
    const peer = await transport.readSignalsForAgent('worker-2');
    assert.ok(target.some((signal) => signal.signalId === result.signalId));
    assert.ok(!peer.some((signal) => signal.signalId === result.signalId));
    console.log('[PASS] testReadRespectsTargetedAudience');
  }

  async function testReadAndAckFailuresAreVisible() {
    resetState();
    await testDb.exec('DROP TABLE signal_subscriptions');
    await assert.rejects(transport.readSignalsForAgent('worker-1'), /signal_subscriptions/);
    await testDb.exec('DROP TABLE signal_deliveries');
    await assert.rejects(transport.markSignalsSeen('worker-1', ['missing-signal']), /signal_deliveries/);
    console.log('[PASS] testReadAndAckFailuresAreVisible');
  }

  async function testReceptorFailureEscalates() {
    resetState();
    const original = receptor.matchAndDispatch;
    receptor.matchAndDispatch = async () => { throw new Error('receptor unavailable'); };
    try {
      const result = await transport.publishSignal({ signalType: 'ligand',
        signalData: { semanticType: 'BROKEN_RECEPTOR', concentration: 0.9 },
        topic: 'broken-receptor', senderAgentId: 'orch-1' });
      assert.equal(result.published, true);
      assert.equal(result.llmRequired, true);
    } finally {
      receptor.matchAndDispatch = original;
    }
    console.log('[PASS] testReceptorFailureEscalates');
  }

  async function testEffectiveAudienceChangeIsPublished() {
    resetState();
    await testDb.run("UPDATE agents SET status = 'active' WHERE id IN ('worker-1', 'worker-2')");
    const params = { signalType: 'ligand', signalData: { semanticType: 'AUDIENCE_CHANGE' },
      topic: 'effective-audience-change', senderAgentId: 'orch-1' };
    const first = await transport.publishSignal(params);
    await testDb.run("UPDATE agents SET status = 'completed' WHERE id = 'worker-2'");
    try {
      const second = await transport.publishSignal(params);
      assert.equal(first.published, true);
      assert.equal(second.published, true, 'Changed routed audience must not be coalesced');
      assert.notEqual(second.signalId, first.signalId);
    } finally {
      await testDb.run("UPDATE agents SET status = 'active' WHERE id = 'worker-2'");
    }
    console.log('[PASS] testEffectiveAudienceChangeIsPublished');
  }

  return async function runAdditionalSignalPlaneCases() {
    await testScopedReadCannotStealDelivery();
    await testRejectedRecipientIsNotPersisted();
    await testReadRespectsProjectScope();
    await testReceptorCannotUpdateOtherProject();
    await testReadRespectsTargetedAudience();
    await testReceptorFailureEscalates();
    await testEffectiveAudienceChangeIsPublished();
    await testReadAndAckFailuresAreVisible();
  };
}

module.exports = { createAdditionalSignalPlaneCases };
