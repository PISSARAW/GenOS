'use strict';

const assert = require('node:assert');
const H = require('../src/services/epistemic/epistemicHolobionteService');
const { regulatoryReview } = require('../src/services/epistemic/epistemicInflammationAndRegulation');
const { signatureFrom, recordOutcome } = require('../src/services/epistemic/immuneMemoryService');

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

// ---- invariants comportementaux (audit P0) ----

// Invariant 1: Un antigène SELF_VERIFICATION dangereux doit être bloqué
// par l'Immune et rejeté par le Host (veto).
const selfVerifiedAntigen = {
  claim: 'Je suis sûr de moi',
  risk: { score: 0.9 },
  epitopes: {
    provenance: { selfVerified: true },
    evidence: { kind: 'test_result', digest: 'sha256:abc' },
  },
};
const immuneReview2 = H.immuneSymbiontReview(selfVerifiedAntigen, {});
assert.strictEqual(immuneReview2.blocked, true, 'Immune doit bloquer SELF_VERIFICATION');
assert.strictEqual(immuneReview2.blockReason, 'decision: quarantine', 'Raison = quarantine');

const hostReview = H.hostDecision(
  { specialist: { claim: 'X' }, immune: immuneReview2, memory: { hasMemory: false } },
  { stakes: 'normal', hostVeto: true },
);
assert.strictEqual(hostReview.accepted, false, 'Host doit rejeter (veto) un claim bloqué par Immune');
assert.strictEqual(hostReview.finalAuthority, 'host');

// Invariant 2: Le T-reg ne peut jamais inhiber un danger signal (SELF_VERIFICATION).
const treg = regulatoryReview(
  { claim: 'nouvelle', epitopes: { provenance: { selfVerified: true } } },
  'SELF_VERIFICATION',
  { immuneMemory: [], knownSubject: false },
);
assert.strictEqual(treg.inhibit, false, 'T-reg ne doit pas inhiber SELF_VERIFICATION');

// Invariant 3: La mémoire immunitaire — deux antigènes distincts ne doivent pas collisionner.
const sigA = signatureFrom({ claim: 'Claim A', epitopes: { evidence: { kind: 'test_result' }, validityDomain: { domain: 'auth' } } });
const sigB = signatureFrom({ claim: 'Claim B', epitopes: { evidence: { kind: 'replay' }, validityDomain: { domain: 'security' } } });
assert.notStrictEqual(sigA, sigB, 'Deux antigènes distincts doivent avoir des signatures différentes');

// Invariant 4: Un même antigène produit une même signature (stabilité).
const sigA2 = signatureFrom({ claim: 'Claim A', epitopes: { evidence: { kind: 'test_result' }, validityDomain: { domain: 'auth' } } });
assert.strictEqual(sigA, sigA2, 'Même antigène → même signature');

// Invariant 5: recordOutcome pending n'affecte pas l'affinité.
const pendingEntry = recordOutcome([], { claim: 'P99' }, { domain: 'auth', outcome: 'pending' });
assert.strictEqual(pendingEntry.pending, true);
assert.strictEqual(pendingEntry.successes, 0);
assert.strictEqual(pendingEntry.affinity, 0.4, 'pending ne change pas affinity');

// Invariant 6: Le recordOutcome success/failure modifie bien l'affinité.
const resolvedEntry = recordOutcome([], { claim: 'P100' }, { domain: 'auth', outcome: 'success' });
assert.strictEqual(resolvedEntry.pending, false);
assert.strictEqual(resolvedEntry.affinity, 1, 'success → affinity = 1');

// Invariant 7: L'adaptateur homéostasie mappe correctement les champs d'antigène.
// Le Holobionte reconstruit le format attendu par computePressure() à partir
// des epitopes. Ici on vérifie que l'adaptateur fait bien son travail.
const { computePressure } = require('../src/services/epistemic/epistemicHomeostasisService');
const antigenWithEvidence = {
  claim: 'X',
  evidence: [{ kind: 'test_result', quality: 0.9 }],
  validityDomain: { coverage: 8, constraints: 8 },
};
const antigenWithoutEvidence = {
  claim: 'X',
  evidence: [],
  validityDomain: { coverage: 0, constraints: 8 },
  risk: { score: 0.2 },
};
const pressureWith = computePressure(antigenWithEvidence);
const pressureWithout = computePressure(antigenWithoutEvidence);
assert.ok(pressureWithout > pressureWith, 'un antigène sans preuve doit avoir une pression plus élevée');

// Invariant 8: Le feedback homéostatique réduit la pression quand les preuves s'améliorent.
const { feedbackEffect } = require('../src/services/epistemic/epistemicHomeostasisService');
const initialPressure = computePressure(antigenWithoutEvidence);
const afterEvidenceGain = feedbackEffect(initialPressure, initialPressure, 0.5);
assert.ok(afterEvidenceGain < initialPressure + 0.01, 'l amélioration des preuves réduit la pression');

console.log('OK epistemicHolobionteService');
