'use strict';

const assert = require('node:assert');
const M = require('../src/services/epistemic/immuneMemoryService');

// ---- signature stable ----

const s1 = M.signatureFrom('  passing test but incomplete spec  ');
const s2 = M.signatureFrom('passing test but incomplete spec');
assert.strictEqual(s1, s2);

// ---- entrée ----

const entry = M.memoryEntry('A', {
  domain: 'auth',
  evidence: 'T3 failed when token expired',
  effectiveResponse: 'generate semantic obligation coverage',
  affinity: 0.91,
});
assert.strictEqual(entry.domain, 'auth');
assert.ok(entry.affinity >= 0.9);
assert.strictEqual(entry.effectiveResponse, 'generate semantic obligation coverage');

// ---- recall exact ----

const mem = [
  M.memoryEntry('P1', { domain: 'auth', evidence: 'e1', affinity: 0.8 }),
  M.memoryEntry('P2', { domain: 'auth', evidence: 'e2', affinity: 0.5 }),
];
const r = M.recall(mem, 'P1');
assert.ok(r);
assert.strictEqual(r.affinity, 0.8);

const noHit = M.recall(mem, 'P99');
assert.strictEqual(noHit, null);

// P2 a affinity 0.5 >= SEUIL_SIGNATURE_FAIBLE (0.4) => retourne l'entrée
const weakHit = M.recall(mem, 'P2');
assert.ok(weakHit);
assert.strictEqual(weakHit.affinity, 0.5);

// ---- fuzzyRecall ----

const fr = M.fuzzyRecall(mem, 'P1', 'auth', 0.7);
assert.strictEqual(fr.length, 1);
assert.strictEqual(fr[0].affinity, 0.8);

// ---- recordOutcome ----

const fresh = [];
// Tant que la vérité n'est pas résolue, l'outcome reste 'pending'.
const afterPending = M.recordOutcome(fresh, 'P1', { domain: 'auth', outcome: 'pending', effectiveResponse: 'alt' });
assert.strictEqual(afterPending.pending, true);
assert.strictEqual(afterPending.successes, 0);
assert.strictEqual(afterPending.failures, 0);

// Seul un oracle externe peut marquer un résultat comme success/failure.
const after = M.recordOutcome(fresh, 'P1', { domain: 'auth', outcome: 'success', effectiveResponse: 'alt' });
assert.strictEqual(after.pending, false);
assert.strictEqual(after.successes, 1);
assert.strictEqual(after.failures, 0);
assert.strictEqual(after.affinity, 1);

const after2 = M.recordOutcome(fresh, 'P1', { domain: 'auth', outcome: 'failure' });
assert.strictEqual(after2.successes, 1);
assert.strictEqual(after2.failures, 1);
assert.strictEqual(after2.affinity, 0.5);

const after3 = M.recordOutcome(fresh, 'P1', { domain: 'auth', outcome: 'success' });
assert.strictEqual(after3.affinity, 2 / 3);

// ---- priorityRank ----

const rank = M.priorityRank(fresh, 'P1', 'auth');
assert.ok(rank);
assert.ok(rank.strength >= 0);

console.log('OK immuneMemoryService');
