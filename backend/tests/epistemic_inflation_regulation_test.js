'use strict';

const assert = require('node:assert');
const I = require('../src/services/epistemic/epistemicInflammationAndRegulation');
const h = require('../src/services/epistemic/epistemicHomeostasisService');
const M = require('../src/services/epistemic/immuneMemoryService');

// ---- assignation pression / tier ----

const bland = { claim: 'X est vrai', risk: { score: 0.1 }, validityDomain: { coverage: 10, constraints: 10 }, evidence: [{ quality: 0.95 }] };
const assigned = I.assignPressureTier(bland);
assert.strictEqual(assigned.tier, 'baseline');
assert.ok(assigned.pressure < 0.25);

const chaud = { claim: 'X est vrai', risk: { score: 0.9 }, validityDomain: { coverage: 1, constraints: 10 }, evidence: [], contradictions: [{ weight: 0.8 }] };
const chaudAssign = I.assignPressureTier(chaud);
assert.ok(chaudAssign.pressure > 0.5);
assert.ok(['adaptive', 'inflamed', 'systemic'].includes(chaudAssign.tier));

// ---- inflammation ----

assert.strictEqual(I.inflammationLevel('baseline', 0), 'baseline');
assert.strictEqual(I.inflammationLevel('lean', 0), 'lean');
assert.strictEqual(I.inflammationLevel('lean', 3), 'lean_inflamed');
assert.strictEqual(I.inflammationLevel('adaptive', 0), 'adaptive');
assert.strictEqual(I.inflammationLevel('adaptive', 3), 'inflamed');

// ---- shouldInflame ----

assert.strictEqual(I.shouldInflame('baseline', false, 0), false);
assert.strictEqual(I.shouldInflame('inflamed', false, 0), true);
assert.strictEqual(I.shouldInflame('adaptive', true, 0), true);
assert.strictEqual(I.shouldInflame('adaptive', false, 1), true);

// ---- effort recommandé ----

const effortBase = I.recommendedEffort('baseline', 'baseline');
assert.ok(effortBase.includes('innate_only'));
assert.ok(!effortBase.includes('human_escalation'));

const effortSystemic = I.recommendedEffort('systemic', 'systemic');
assert.ok(effortSystemic.includes('human_escalation'));
assert.ok(effortSystemic.includes('replay'));

// ---- régulateur ----

const mem = [M.memoryEntry('old-claim', 'general', 'e', { affinity: 0.9 })];
const novelAntigen = { claim: 'revendication inédite' };

const unjustReject = I.regulatoryReview(novelAntigen, 'aucune source externe', { immuneMemory: mem, knownSubject: false });
assert.ok(unjustReject.inhibit);
assert.strictEqual(unjustReject.action, 'inhibit_rejection');

const justifiedReject = I.regulatoryReview({ claim: 'old claim', epitopes: { evidence: { kind: 'test_result' } } }, 'contradiction avérée', { immuneMemory: mem, knownSubject: true });
assert.ok(!justifiedReject.inhibit);

const selfVerifiedNovel = I.regulatoryReview({ epitopes: { provenance: { selfVerified: true } } }, 'autoverification', { immuneMemory: [], knownSubject: false });
assert.ok(selfVerifiedNovel.inhibit);

// ---- novelty ----

assert.ok(I.isNovelClaim({ claim: 'jamais vu' }, mem));
assert.ok(!I.isNovelClaim({ claim: 'old-claim' }, mem));

// ---- justification ----

assert.ok(I.isJustifiedRejection('contradiction avérée'));
assert.ok(!I.isJustifiedRejection('aucune source externe'));
assert.ok(!I.isJustifiedRejection('revendication inhabituelle'));

console.log('OK epistemicInflammationAndRegulation');
