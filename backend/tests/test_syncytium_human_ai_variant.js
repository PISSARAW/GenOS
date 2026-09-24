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
    approvalId: 'approval-1', actionId: 'migration-1', decision: 'approved'
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_AI_INVALID');
  await syncytium.submitHumanApproval(session.sessionId, {
    opId: 'approval-by-human', actorId: 'maya', nucleusId: 'human-editor',
    approvalId: 'approval-1', actionId: 'migration-1', decision: 'approved', reason: 'Reviewed the guard.'
  });
  const executed = await syncytium.executeApprovedAction(session.sessionId, {
    txId: 'execute-migration', actorId: 'worker-1', nucleusId: 'llm-worker',
    approvalId: 'approval-1', actionId: 'migration-1', action: { migration: 'apply-v4' }
  });
  assert.equal(executed.action.actorId, 'worker-1');
  await assert.rejects(() => syncytium.executeApprovedAction(session.sessionId, {
    txId: 'execute-migration-again', actorId: 'worker-1', nucleusId: 'llm-worker',
    approvalId: 'approval-1', actionId: 'migration-1', action: { migration: 'apply-v4' }
  }), (error) => error.code === 'SYNCYTIUM_APPROVAL_CONSUMED');

  const snapshot = await syncytium.humanAiSnapshot(session.sessionId);
  assert.equal(snapshot.shared.sharedFields['human.presence'].maya.status, 'reviewing');
  assert.equal(snapshot.shared.sharedFields['human.comments'].length, 1);
  assert.equal(snapshot.shared.sharedFields['critical.actions']['migration-1'].approvalId, 'approval-1');
  await syncytium.releaseHumanLease(session.sessionId, {
    txId: 'release-lease', opId: 'release-lease-op', actorId: 'maya', nucleusId: 'human-editor',
    resourceId: 'schema:migration', leaseToken: lease.lease.leaseToken
  });
}

main().then(() => console.log('Syncytium human-AI variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
