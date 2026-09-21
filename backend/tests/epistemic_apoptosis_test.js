'use strict';

const assert = require('node:assert');
const A = require('../src/services/epistemic/epistemicApoptosisService');

// ---- dissonance / niveau ----

assert.strictEqual(A.dissonanceFrom([]), 0);
assert.strictEqual(A.dissonanceFrom([1, 2, 3]), 6);
assert.strictEqual(A.dissonanceFrom([5]), 5);
assert.strictEqual(A.niveauCorpsent(0), A.NIVEAUX.baseline);
assert.strictEqual(A.niveauCorpsent(5), A.NIVEAUX.warning);
assert.strictEqual(A.niveauCorpsent(15), A.NIVEAUX.reduced_authority);
assert.strictEqual(A.niveauCorpsent(30), A.NIVEAUX.quarantine);
assert.strictEqual(A.niveauCorpsent(50), A.NIVEAUX.apoptosis);
assert.strictEqual(A.niveauCorpsent(51), A.NIVEAUX.apoptosis);
assert.strictEqual(A.niveauCorpsent(60), A.NIVEAUX.apoptosis);

// ---- accumulate ----

const start = { id: 'agent-1', epistemicDissonance: 0 };
const after1 = A.accumulate(start, [3, 2]);
assert.strictEqual(after1.epistemicDissonance, 5);
assert.strictEqual(after1.statusLevel, A.NIVEAUX.warning);

const after2 = A.accumulate(after1, [10]);
assert.strictEqual(after2.epistemicDissonance, 15);
assert.strictEqual(after2.statusLevel, A.NIVEAUX.reduced_authority);

// ---- peutApoptoser ----

assert.ok(!A.peutApoptoser({ epistemicDissonance: 40 }));
assert.ok(A.peutApoptoser({ epistemicDissonance: 50 }));
assert.ok(A.peutApoptoser({ epistemicDissonance: 51 }));
assert.ok(A.peutApoptoser({ epistemicDissonance: 40 }, 40));

// ---- apoptose ----

const agent = { id: 'agent-2', epistemicDissonance: 55, terminatedAt: null };
const dead = A.apoptose(agent);
assert.strictEqual(dead.status, 'apoptotique');
assert.strictEqual(dead.statusLevel, A.NIVEAUX.apoptosis);
assert.ok(dead.terminatedAt);
assert.strictEqual(dead.epistemicDissonance, 55);

// ---- autopsy ----

const causa = A.autopsy(dead, 'fabricated_evidence_pattern', ['preuve inventée', 'self-verification']);
assert.strictEqual(causa.subject, 'agent-2');
assert.ok(causa.autopsySignature);
assert.strictEqual(causa.observations.length, 2);
assert.strictEqual(causa.epistemicDissonanceAtDeath, 55);

console.log('OK epistemicApoptosisService');
