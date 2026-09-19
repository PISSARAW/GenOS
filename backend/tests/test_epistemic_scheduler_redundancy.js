'use strict';

const assert = require('node:assert/strict');
const { ActiveTaskRegistry, verificationReplicaTarget } = require('../src/services/epistemicScheduler');

function descriptor(suffix) {
  return {
    actorId: `agent-${suffix}`,
    model: `model-${suffix}`,
    version: '1',
    strategy: `strategy-${suffix}`,
    evidenceSource: `source-${suffix}`,
    workspaceId: `workspace-${suffix}`,
  };
}

function task(taskId, independence = undefined) {
  return {
    taskId,
    canonicalStatement: 'Le lemme L est valide.',
    assumptions: [],
    validityDomain: { statement: 'Entiers naturels.', constraints: [] },
    dependencies: [],
    independence,
  };
}

assert.equal(verificationReplicaTarget({ risk: 'critical' }), 3);
assert.equal(verificationReplicaTarget({ risk: 'high' }), 2);
assert.equal(verificationReplicaTarget({ requireIndependentVerification: true }), 1);

const registry = new ActiveTaskRegistry();
registry.register(task('primary', descriptor('primary')));
const first = registry.registerVerificationReplica(task('verify-a'), descriptor('a'));
assert.equal(first.decision, 'replica_accepted');

const sameExecution = registry.registerVerificationReplica(task('verify-copy'), {
  ...descriptor('b'), actorId: 'agent-a', workspaceId: 'workspace-a',
});
assert.equal(sameExecution.decision, 'replica_rejected');
assert.equal(sameExecution.reason, 'insufficient_independence');

const second = registry.registerVerificationReplica(task('verify-b'), descriptor('b'));
assert.equal(second.decision, 'replica_accepted');
const limited = registry.registerVerificationReplica(task('verify-c'), descriptor('c'));
assert.equal(limited.reason, 'replica_limit');

const isolated = new ActiveTaskRegistry();
const missingPrimary = isolated.registerVerificationReplica(task('orphan'), descriptor('x'));
assert.equal(missingPrimary.reason, 'no_active_primary');

console.log('Epistemic scheduler independent redundancy policy passed.');
