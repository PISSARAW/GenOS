'use strict';

const assert = require('node:assert/strict');
const { ActiveTaskRegistry, taskFingerprint } = require('../src/services/epistemicScheduler');

function task(taskId, overrides = {}) {
  return {
    taskId,
    canonicalStatement: 'Pour tout n dans D, P(n).',
    assumptions: [{ id: 'A2', statement: 'D est fini.' }, { id: 'A1', statement: 'n appartient à D.' }],
    validityDomain: { statement: 'Ensemble D.', constraints: ['n ∈ D', '|D| < ∞'] },
    dependencies: [],
    ...overrides,
  };
}

const reordered = task('other', {
  assumptions: [{ id: 'A1', statement: 'n appartient à D.' }, { id: 'A2', statement: 'D est fini.' }],
  validityDomain: { statement: 'Ensemble D.', constraints: ['|D| < ∞', 'n ∈ D'] },
});
assert.equal(taskFingerprint(task('one')), taskFingerprint(reordered));

const registry = new ActiveTaskRegistry({ clock: () => '2026-09-19T12:00:00.000Z' });
const first = registry.register(task('task-1'));
assert.equal(first.decision, 'accepted');
assert.equal(first.canonicalTaskId, 'task-1');

const grouped = registry.register(task('task-2'));
assert.equal(grouped.decision, 'coalesced');
assert.equal(grouped.canonicalTaskId, 'task-1');

const rejected = registry.register(task('task-3'), { duplicatePolicy: 'reject' });
assert.equal(rejected.decision, 'rejected');
assert.equal(registry.snapshot()[0].members.length, 2);

registry.transition('task-1', 'completed');
registry.transition('task-2', 'completed');
const replacement = registry.register(task('task-4'));
assert.equal(replacement.decision, 'accepted');
assert.equal(replacement.canonicalTaskId, 'task-4');
assert.throws(() => registry.register(task('task-4')), /already registered/);

console.log('Epistemic scheduler active fingerprint registry passed.');
