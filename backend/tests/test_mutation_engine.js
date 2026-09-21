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

// HGT with immune gate
const source = createResearchLineage({ name: 'source', strategies: ['ring'] });
const target = createResearchLineage({ name: 'target', strategies: ['induction'] });
const r4 = engine.horizontalGeneTransfer(source, target, { blocked: false });
assert.ok(r4 !== null);
assert.ok(target.genome.strategies.includes('ring'));
assert.ok(r4.plasmid);

// HGT blocked by immune system
const blockedSource = createResearchLineage({ name: 'blocked', strategies: ['omega'] });
const blockedTarget = createResearchLineage({ name: 'blocked-target', strategies: ['induction'] });
const r5 = engine.horizontalGeneTransfer(blockedSource, blockedTarget, { blocked: true, blockReason: 'contradiction' });
assert.ok(r5 === null);

// Summary
const s = engine.summary();
assert.ok(s.mutations >= 4);

console.log('OK MutationEngine (HGT immune gate verified)');
