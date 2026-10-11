'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createHumanAiSession('Human and AI collaborate on guarded changes.', {
    nuclei: [
      { nucleusId: 'human-editor', principalId: 'maya', kind: 'human' },
      { nucleusId: 'llm-worker', principalId: 'worker-1', kind: 'llm_worker' },
      { nucleusId: 'test-daemon', principalId: 'test-1', kind: 'test_daemon' },
      { nucleusId: 'security-verifier', principalId: 'security-1', kind: 'security_verifier' }
    ]
  });

  await syncytium.updateHumanPresence(session.sessionId, {
    opId: 'presence-human', actorId: 'maya', nucleusId: 'human-editor', status: 'reviewing'
  });
  await syncytium.addHumanComment(session.sessionId, {
    opId: 'comment-human', actorId: 'maya', nucleusId: 'human-editor', comment: 'Please inspect the migration guard.'
  });

  const lease = await syncytium.acquireHumanLease(session.sessionId, {
    txId: 'lease-human', actorId: 'maya', nucleusId: 'human-editor', resourceId: 'schema:migration', now: 1000, ttlMs: 5000
  });
  assert.equal(lease.lease.holderId, 'maya');
  assert.equal(lease.lease.fence, 1);
  await assert.rejects(() => syncytium.acquireHumanLease(session.sessionId, {
    txId: 'lease-worker', actorId: 'worker-1', nucleusId: 'llm-worker', resourceId: 'schema:migration', now: 2000
  }), (error) => error.code === 'SYNCYTIUM_LEASE_HELD');

  await assert.rejects(() => syncytium.submitHumanApproval(session.sessionId, {
    opId: 'approval-by-ai', actorId: 'worker-1', nucleusId: 'llm-worker',
    approvalId: 'approval-1', actionId: 'migration-1', executorId: 'worker-1',
    action: { migration: 'apply-v4' }, decision: 'approved'
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_AI_INVALID');
  await assert.rejects(() => syncytium.submitHumanApproval(session.sessionId, {
    opId: 'approval-without-action', actorId: 'maya', nucleusId: 'human-editor',
    approvalId: 'approval-1', actionId: 'migration-1', decision: 'approved'
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_AI_INVALID');
  const reviewedAction = { migration: 'apply-v4' };
  await syncytium.submitHumanApproval(session.sessionId, {
    opId: 'approval-by-human', actorId: 'maya', nucleusId: 'human-editor',
    approvalId: 'approval-1', actionId: 'migration-1', executorId: 'worker-1',
    action: reviewedAction, decision: 'approved', reason: 'Reviewed the guard.'
  });
  reviewedAction.migration = 'apply-v5';
  await assert.rejects(() => syncytium.executeApprovedAction(session.sessionId, {
    txId: 'execute-other-payload', actorId: 'worker-1', nucleusId: 'llm-worker',
    approvalId: 'approval-1', actionId: 'migration-1', action: { migration: 'apply-v5' }
  }), (error) => error.code === 'SYNCYTIUM_APPROVAL_REQUIRED');
  await assert.rejects(() => syncytium.executeApprovedAction(session.sessionId, {
    txId: 'execute-other-worker', actorId: 'test-1', nucleusId: 'test-daemon',
    approvalId: 'approval-1', actionId: 'migration-1', action: { migration: 'apply-v4' }
  }), (error) => error.code === 'SYNCYTIUM_APPROVAL_REQUIRED');
  const approvedRequest = {
    actorId: 'worker-1', nucleusId: 'llm-worker', approvalId: 'approval-1',
    actionId: 'migration-1', action: { migration: 'apply-v4' }
  };
  await assert.rejects(() => syncytium.executeApprovedAction(session.sessionId, {
    ...approvedRequest, txId: 'execute-without-consent'
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_CONSENT_REQUIRED');
  await assert.rejects(() => syncytium.setHumanConsent(session.sessionId, {
    actorId: 'maya', nucleusId: 'human-editor', agentId: 'worker-1', granted: true, scope: 'other-session'
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_AI_INVALID');
  await assert.rejects(() => syncytium.setHumanConsent(session.sessionId, {
    actorId: 'worker-1', nucleusId: 'llm-worker', agentId: 'worker-1', granted: true
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_AI_INVALID');
  await syncytium.setHumanConsent(session.sessionId, {
    actorId: 'maya', nucleusId: 'human-editor', agentId: 'worker-1', granted: true
  });
  await syncytium.setHumanConsent(session.sessionId, {
    actorId: 'maya', nucleusId: 'human-editor', agentId: 'worker-1', granted: false
  });
  await assert.rejects(() => syncytium.executeApprovedAction(session.sessionId, {
    ...approvedRequest, txId: 'execute-after-withdrawal'
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_CONSENT_REQUIRED');
  await syncytium.setHumanConsent(session.sessionId, {
    actorId: 'maya', nucleusId: 'human-editor', agentId: 'worker-1', granted: true
  });
  const executionAction = { migration: 'apply-v4' };
  const executed = await syncytium.executeApprovedAction(session.sessionId, {
    txId: 'execute-migration', actorId: 'worker-1', nucleusId: 'llm-worker',
    approvalId: 'approval-1', actionId: 'migration-1', action: executionAction
  });
  executionAction.migration = 'apply-v5';
  assert.equal(executed.action.actorId, 'worker-1');
  assert.equal(executed.action.status, 'authorized_recorded');
  await assert.rejects(() => syncytium.executeApprovedAction(session.sessionId, {
    txId: 'execute-migration-again', actorId: 'worker-1', nucleusId: 'llm-worker',
    approvalId: 'approval-1', actionId: 'migration-1', action: { migration: 'apply-v4' }
  }), (error) => error.code === 'SYNCYTIUM_APPROVAL_CONSUMED');

  const snapshot = await syncytium.humanAiSnapshot(session.sessionId);
  assert.equal(snapshot.shared.sharedFields['human.presence'].maya.status, 'reviewing');
  assert.equal(snapshot.shared.sharedFields['human.comments'].length, 1);
  assert.equal(snapshot.shared.sharedFields['critical.actions']['migration-1'].approvalId, 'approval-1');
  assert.deepEqual(snapshot.shared.sharedFields['critical.actions']['migration-1'].action, { migration: 'apply-v4' });
  await syncytium.releaseHumanLease(session.sessionId, {
    txId: 'release-lease', opId: 'release-lease-op', actorId: 'maya', nucleusId: 'human-editor',
    resourceId: 'schema:migration', leaseToken: lease.lease.leaseToken
  });
}

main().then(() => console.log('Syncytium human-AI variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
