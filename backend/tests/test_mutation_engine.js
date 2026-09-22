'use strict';

const assert = require('node:assert');
const { MutationEngine } = require('../src/services/mathematical/mutationEngine');
const { createResearchLineage } = require('../src/services/mathematical/researchLineage');

const engine = new MutationEngine({ mutationRate: 1.0, recombinationRate: 1.0, hgtRate: 1.0, exaptationRate: 1.0 });
const l1 = createResearchLineage({ name: 'p1', strategies: ['induction'] });
const l2 = createResearchLineage({ name: 'p2', strategies: ['contradiction'] });

// Point mutation
const r1 = engine.pointMutate(l1);
assert.ok(r1 !== null);
assert.strictEqual(r1.type, 'point');

// Recombination
const r2 = engine.recombine(l1, l2);
assert.ok(r2 !== null);
assert.ok(r2.child);
assert.ok(r2.child.genome.strategies.length > 0);

// Exaptation
const r3 = engine.exapt(l1, 'graph-theory');
assert.ok(r3 !== null);
assert.strictEqual(r3.type, 'exaptation');

// HGT with immune gate - requires a verified ProofArtifact
const createMockVerifiedProofArtifact = (statement) => ({
  statement,
  isVerified: () => true,
  _leanReceipt: { status: 'passed', receiptDigest: 'sha256:' + 'a'.repeat(64) }, // Valid SHA-256 format
  _formalResult: { canonicalStatement: statement, domain: 'general' },
  type: 'lemma',
  domain: 'general',
});

const source = createResearchLineage({ name: 'source', strategies: ['ring'] });
source.fitness = { P: 0.5, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 }; // Verified fitness for AEIS
const target = createResearchLineage({ name: 'target', strategies: ['induction'] });
const proofArtifact = createMockVerifiedProofArtifact('ring_lemma');
const r4 = engine.horizontalGeneTransfer(source, target, proofArtifact, { blocked: false });
assert.ok(r4 !== null);
// Lemmas vérifiés vont dans _knowledge (pas strategies) — comportement correct du point 3
assert.ok(target._knowledge && target._knowledge.length === 1, 'Lemma should be in knowledge base');
assert.ok(target._knowledge[0].proofArtifact, 'Knowledge should preserve ProofArtifact reference');
assert.ok(r4.plasmid);
assert.strictEqual(r4.plasmid.assimilationStatus, 'assimilated');
assert.strictEqual(r4.plasmid.type, 'knowledge');

// HGT blocked by immune system
const blockedSource = createResearchLineage({ name: 'blocked', strategies: ['omega'] });
const blockedTarget = createResearchLineage({ name: 'blocked-target', strategies: ['induction'] });
const r5 = engine.horizontalGeneTransfer(blockedSource, blockedTarget, null, { blocked: true, blockReason: 'contradiction' });
assert.ok(r5 === null);

// HGT with unverified artifact should fail
const unverifiedSource = createResearchLineage({ name: 'unverified', strategies: ['fake'] });
const unverifiedTarget = createResearchLineage({ name: 'unverified-target', strategies: ['induction'] });
const unverifiedArtifact = { isVerified: () => false };
const r6 = engine.horizontalGeneTransfer(unverifiedSource, unverifiedTarget, unverifiedArtifact, { blocked: false });
assert.ok(r6 === null || r6.plasmid?.assimilationStatus === 'rejected', 'Unverified artifact should be rejected');

// Summary
const s = engine.summary();
assert.ok(s.mutations >= 4);

console.log('OK MutationEngine (HGT requires verified ProofArtifact)');
