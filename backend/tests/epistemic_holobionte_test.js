'use strict';

const assert = require('node:assert');
const H = require('../src/services/epistemic/epistemicHolobionteService');

// ---- hostDecision ----

const hostAccept = H.hostDecision(
  { specialistOutput: { claim: 'X' }, immuneReport: { blocked: false }, memoryReport: { hasMemory: false } },
  { stakes: 'normal', hostVeto: true },
);
assert.strictEqual(hostAccept.accepted, true);
assert.strictEqual(hostAccept.finalAuthority, 'host');

const hostReject = H.hostDecision(
  { specialistOutput: { claim: 'X' }, immuneReport: { blocked: true, blockReason: 'contradiction' }, memoryReport: { hasMemory: false } },
  { stakes: 'normal', hostVeto: true },
);
assert.strictEqual(hostReject.accepted, false);
assert.strictEqual(hostReject.reason, 'Host veto: contradiction');

const hostOverride = H.hostDecision(
  { specialistOutput: { claim: 'X' }, immuneReport: { blocked: true, blockReason: 'contradiction', regulatorInhibited: true }, memoryReport: { hasMemory: false } },
  { stakes: 'normal', hostVeto: true },
);
assert.strictEqual(hostOverride.accepted, true);
assert.strictEqual(hostOverride.reason, 'Host override: régulateur a inhibé le rejet');

// ---- immuneSymbiontReview ----

const antigen = {
  claim: 'p < 0.05 suffit',
  epitopes: {
    evidence: { kind: 'test_result', digest: 'sha256:abc' },
    assumptions: ['p value only'],
  },
};

const immuneReview = H.immuneSymbiontReview(antigen, {});
assert.ok(immuneReview.pipeline);
assert.ok(typeof immuneReview.blocked === 'boolean');
assert.ok(typeof immuneReview.regulatorInhibited === 'boolean');

// ---- memorySymbiontLookup ----

const memory = [];
const memLookup = H.memorySymbiontLookup(antigen, { immuneMemory: memory, domain: 'auth' });
assert.strictEqual(memLookup.hasMemory, false);
assert.strictEqual(memLookup.directHit, null);
assert.deepStrictEqual(memLookup.fuzzyHits, []);

// ---- specialistSymbioteSolve ----

const specialist = H.specialistSymbioteSolve(antigen, {});
assert.strictEqual(specialist.claim, 'p < 0.05 suffit');
assert.ok(specialist.solvedAt);

// ---- epistemicHolobionte complet ----

const result = H.epistemicHolobionte(antigen, {
  domain: 'auth',
  stakes: 'normal',
  hostVeto: true,
  immuneMemory: [],
});

assert.ok(typeof result.accepted === 'boolean');
assert.strictEqual(result.finalAuthority, 'host');
assert.ok(result.specialist);
assert.ok(result.immune);
assert.ok(result.memory);
assert.ok(result.biocenose);
assert.ok(result.homeostasis);
assert.ok(typeof result.epistemicDissonance === 'number');
assert.ok(typeof result.statusLevel === 'number');
assert.ok(result.statusLevel >= 0);
assert.ok(result.timestamp);

console.log('OK epistemicHolobionteService');
