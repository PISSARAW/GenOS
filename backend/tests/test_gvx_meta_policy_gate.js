'use strict';

const assert = require('assert');
const { assessMetaPolicyChange } = require('../src/services/gvxMetaPolicyGate');

function input() {
  return {
    scope: { organizationId: 'org-a', projectId: 'project-a' }, entityId: 'organism-a',
    plasticity: 'P9', surface: 'learning_policy', policyId: 'policy-v2',
    parentHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64), heldOutSuiteHash: 'c'.repeat(64),
    controlHashes: { sandbox: 'sandbox-v1', verifier: 'verifier-v1', hiddenEvaluation: 'hidden-v1', authority: 'authority-v1' },
    minTasks: 2,
    tasks: [
      { taskId: 'task-1', status: 'completed', artifactHash: 'd'.repeat(64), regressed: false },
      { taskId: 'task-2', status: 'completed', artifactHash: 'e'.repeat(64), regressed: false }
    ]
  };
}

assert.strictEqual(assessMetaPolicyChange(input()).status, 'ready_for_external_review');
assert.strictEqual(assessMetaPolicyChange({ ...input(), tasks: input().tasks.slice(0, 1) }).status, 'inconclusive');
assert.strictEqual(assessMetaPolicyChange({
  ...input(), tasks: input().tasks.map((task, index) => ({ ...task, regressed: index === 1 }))
}).status, 'reject');
assert.throws(() => assessMetaPolicyChange({ ...input(), surface: 'proof_verifier' }), { code: 'GVX_META_CHANGE_INVALID' });
console.log('GVX meta-policy gate checks passed.');
