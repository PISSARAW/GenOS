const assert = require('assert');

function signalPlaneScopeCases({ testDb, transport, receptor, resetState }) {
  async function testRejectedRecipientIsNotPersisted() {
    resetState();
    await testDb.run(`INSERT INTO projects (id, organization_id, name) VALUES ('proj-other', 'org-test', 'Other Project')`);
    await testDb.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
      VALUES ('ws-other', 'Other Workspace', '/tmp/other', 'org-test', 'proj-other')`);
    await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id)
      VALUES ('worker-other', 'Other Worker', 'worker', 'active', 'worker', 'ws-other', 'orch-1')`);
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'TEST_READY', concentration: 1 },
      topic: 'scope-rejected', senderAgentId: 'orch-1', recipientAgentIds: ['worker-other'] });
    assert.equal(result.published, false);
    assert.equal(result.suppressedBy, 'recipient_scope');
    const row = await testDb.get('SELECT signal_id FROM signal_blobs WHERE signal_id = ?', result.signalId);
    assert.equal(row, undefined);
    console.log('[PASS] testRejectedRecipientIsNotPersisted');
  }

  async function testReadRespectsProjectScope() {
    resetState();
    await testDb.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
      VALUES ('orch-other', 'Other Orchestrator', 'orchestrator', 'idle', 'orchestrator', 'ws-other')`);
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'OTHER_PROJECT', concentration: 0.9 },
      senderAgentId: 'orch-other' });
    assert.equal(result.published, true);
    const own = await transport.readSignalsForAgent('worker-other');
    const foreign = await transport.readSignalsForAgent('worker-1');
    assert.ok(own.some((signal) => signal.signalId === result.signalId));
    assert.ok(!foreign.some((signal) => signal.signalId === result.signalId));
    console.log('[PASS] testReadRespectsProjectScope');
  }

  async function testReceptorCannotUpdateOtherProject() {
    resetState();
    receptor.registerReceptor({ id: 'foreign-update', targetLigand: 'FOREIGN_UPDATE',
      threshold: 0.5, action: 'update_agent',
      actionData: { agentId: 'worker-other', status: 'completed' } });
    const result = await transport.publishSignal({ signalType: 'ligand',
      signalData: { semanticType: 'FOREIGN_UPDATE', concentration: 1 },
      topic: 'foreign-update', senderAgentId: 'orch-1' });
    const target = await testDb.get('SELECT status FROM agents WHERE id = ?', ['worker-other']);
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

  async function testReadAndAckFailuresAreVisible() {
    resetState();
    await testDb.exec('DROP TABLE signal_subscriptions');
    await assert.rejects(transport.readSignalsForAgent('worker-1'), /signal_subscriptions/);
    await testDb.exec('DROP TABLE signal_deliveries');
    await assert.rejects(transport.markSignalsSeen('worker-1', ['missing-signal']), /signal_deliveries/);
    console.log('[PASS] testReadAndAckFailuresAreVisible');
  }

  return async () => {
    await testRejectedRecipientIsNotPersisted();
    await testReadRespectsProjectScope();
    await testReceptorCannotUpdateOtherProject();
    await testReadRespectsTargetedAudience();
    await testReceptorFailureEscalates();
    await testReadAndAckFailuresAreVisible();
  };
}

module.exports = { signalPlaneScopeCases };
