'use strict';

const assert = require('node:assert/strict');
const { MorphParticipant } = require('../src/services/morphProtocol/participant');
const native = require('../src/services/morphogenesis/transitionEngineService');
const fixture = require('./helpers/missionProtocolsMorphFixture');
const recovery = require('../src/services/missionProtocols/morphRecovery');

async function committedBeforeAcknowledgement(input) {
  const original = MorphParticipant.prototype.commit;
  let result;
  try {
    MorphParticipant.prototype.commit = async () => { throw new Error('simulated participant disconnect after actual native commit'); };
    result = await require('../src/services/morphogenesis/morphogenesisGitService').executeVersionedTransition(input);
  } finally { MorphParticipant.prototype.commit = original; }
  assert.equal(result.receipt.committed, true, JSON.stringify(result.receipt));
  assert.equal(result.receipt.protocol.status, 'recovery_required');
  assert.equal(result.receipt.protocol.decision.decision, 'COMMIT');
  const snapshotId = result.receipt.durableSnapshot.id;
  await assert.rejects(recovery.resume({ db: input.db, snapshotId,
    req: { ...input.req, tenant: { ...input.req.tenant, projectId: 'foreign' } } }), /RECOVERY_SCOPE_REJECTED/);
  const resumed = await recovery.resume({ db: input.db, snapshotId, req: input.req });
  assert.equal(resumed.committed, true);
  assert.equal(resumed.replay, true);
  assert.equal(resumed.protocol.status, 'finalized');
  const again = await recovery.resume({ db: input.db, snapshotId, req: input.req });
  assert.equal(again.protocol.status, 'finalized');
  assert.equal((await require('../src/services/morphogenesis/morphogenesisGitService').getLineage(input.db, input.agentId)).length, 1,
    'recovery verifies the actual committed native graph and does not rerun the mutation');
}

async function nativeRefusalCannotUndoProtocolDecision(input) {
  await input.db.run('UPDATE morphogenesis_hysteresis SET last_commit_unix_ms=?', Date.now() - 60000);
  const result = await native.executeTransition({ ...input,
    plan: { ...input.plan, id: 'native-persist-failure', targetOrganization: 'biome' },
    persistCommit: async () => { throw new Error('forced actual native version persistence failure'); } });
  assert.equal(result.committed, false);
  assert.equal(result.rollbackReceipt.durableRestored, true);
  assert.equal(result.protocol.status, 'recovery_required');
  assert.equal(result.protocol.decision.decision, 'COMMIT', 'native compensation never erases the irreversible protocol decision');
  assert.equal(input.collectiveState.topologyState.organization, 'rhizome');
  const snapshot = await input.db.get('SELECT status FROM morphogenesis_transition_snapshots WHERE snapshot_id=?', result.durableSnapshot.id);
  assert.equal(snapshot.status, 'restored');
}

async function main() {
  const input = await fixture.create();
  try {
    await committedBeforeAcknowledgement(input);
    await nativeRefusalCannotUndoProtocolDecision(input);
    console.log('Mission MORPH native-commit/ACK interruption, scoped restart, no redispatch and irreversible recovery decision: PASS');
  } finally { await input.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
