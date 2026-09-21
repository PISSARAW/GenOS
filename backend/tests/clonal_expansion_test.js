'use strict';

const assert = require('node:assert');
const C = require('../src/services/epistemic/clonalExpansionService');

// ---- mutations de stratégie ----

const s = ['étape1', 'étape2', 'étape3'];

const prepended = C.mutateStrategy(s, 'prepend');
assert.strictEqual(prepended.length, 4);
assert.strictEqual(prepended[0], 'recherche contre-exemple');

const swapped = C.mutateStrategy(s, 'swap');
assert.strictEqual(swapped[1], s[2]);

const truncated = C.mutateStrategy(s, 'truncate');
assert.strictEqual(truncated.length, 2);

const duplicated = C.mutateStrategy(s, 'duplicate');
assert.strictEqual(duplicated.length, 4);

const unchanged = C.mutateStrategy(s, 'unknown');
assert.deepStrictEqual(unchanged, s);

// ---- expansion clonale ----

const parent = {
  id: 'v-1',
  type: 'testResult',
  strategy: ['reproduire', 'comparer'],
  affinity: 0.85,
};

const clones = C.expandClone(parent, { count: 3 });
assert.strictEqual(clones.length, 3);
assert.ok(clones.every((c) => c.parentId === 'v-1'));
assert.ok(clones.every((c) => c.isClone === true));
assert.ok(clones.every((c) => c.affinity === 0.85));
assert.ok(clones.every((c) => C.MUTATIONS.includes(c.mutation)));

// ---- sélection du clone gagnant ----

const resolvedClones = [
  { ...clones[0], affinity: 0.92, successes: 3, failures: 0, pending: false },
  { ...clones[1], affinity: 0.78, successes: 1, failures: 2, pending: false },
  { ...clones[2], affinity: 0.88, successes: 2, failures: 1, pending: false },
];

const { winner, promotedClones } = C.selectWinningClones(parent, resolvedClones);
assert.strictEqual(winner.affinity, 0.92);
assert.strictEqual(promotedClones.length, 1);

// Si aucun clone ne bat le parent, le parent reste.
const lowClones = [
  { ...clones[0], affinity: 0.6, successes: 1, failures: 2, pending: false },
];
const result2 = C.selectWinningClones(parent, lowClones);
assert.strictEqual(result2.winner.id, 'v-1');
assert.strictEqual(result2.promotedClones.length, 0);

// ---- cloneId ----

const id1 = C.cloneId();
const id2 = C.cloneId();
assert.ok(id1 && id2 && id1 !== id2);

console.log('OK clonalExpansionService');
