'use strict';

const assert = require('assert');
const svc = require('../src/services/forkIdentityService');

// Sørensen-Dice: identical sets → 1
const identical = svc.phenotypicSimilarityOf(
  { id: 'a', phenotype: { capabilities: ['py', 'lean'] } },
  { id: 'b', phenotype: { capabilities: ['py', 'lean'] } }
);
assert.strictEqual(identical.value.similarityRatio, 1, 'Sørensen-Dice identical sets = 1');

// Sørensen-Dice: A={py,lean} B={py,lean,rust} → 2*2/(2+3) = 0.8
const partial = svc.phenotypicSimilarityOf(
  { id: 'a', phenotype: { capabilities: ['py', 'lean'] } },
  { id: 'b', phenotype: { capabilities: ['py', 'lean', 'rust'] } }
);
assert.strictEqual(partial.value.similarityRatio, 0.8, 'Sørensen-Dice A={py,lean} B={py,lean,rust} = 0.8');

// Parent relations: parent→child = a-is-parent-of-b
const parent = { id: 'p', genome: { id: 'g1', lineageId: 'LP', parents: [] } };
const child = { id: 'c', genome: { id: 'g2', lineageId: 'LC', parents: [{ lineageId: 'LP' }] } };
const r1 = svc.lineageRelationBetween(parent, child);
assert.strictEqual(r1.relation, 'a-is-parent-of-b', 'parent→child = a-is-parent-of-b');

const r2 = svc.lineageRelationBetween(child, parent);
assert.strictEqual(r2.relation, 'b-is-parent-of-a', 'child→parent = b-is-parent-of-a');

// Causal: identical → continuous
const causal1 = svc.causalContinuityBetween(
  { causalChain: ['a', 'b', 'c'] },
  { causalChain: ['a', 'b', 'c'] }
);
assert.strictEqual(causal1.value, 'continuous', 'identical chains = continuous');

// Causal: A shorter → shared-until
const causal2 = svc.causalContinuityBetween(
  { causalChain: ['a', 'b', 'c'] },
  { causalChain: ['a', 'b', 'c', 'd'] }
);
assert.strictEqual(causal2.value, 'shared-until', 'A shorter = shared-until');

// Memory: asymmetric B longer → forked
const mem1 = svc.memoryContinuityBetween(
  { memory: [{ id: 1 }, { id: 2 }] },
  { memory: [{ id: 1 }, { id: 2 }, { id: 3 }] }
);
assert.strictEqual(mem1.value, 'forked', 'B longer = forked');

const mem2 = svc.memoryContinuityBetween(
  { memory: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  { memory: [{ id: 1 }, { id: 2 }] }
);
assert.strictEqual(mem2.value, 'forked', 'A longer = forked');

// compare: 8 dimensions
const result = svc.compare(
  { id: 'a', genome: { lineageId: 'L1' }, phenotype: { capabilities: ['x'] }, causalChain: ['a'] },
  { id: 'b', genome: { lineageId: 'L2' }, phenotype: { capabilities: ['x'] }, causalChain: ['a'] }
);
assert.strictEqual(Object.keys(result.dimensions).length, 8, '8 dimensions');
assert.strictEqual(result.executable, false, 'executable=false');
assert.strictEqual(result.runtimeAuthority, false, 'runtimeAuthority=false');
assert.ok(!('verdict' in result), 'no verdict emitted');
assert.ok(!('identity' in result), 'no global identity field');

console.log('Fork identity service tests passed (8 dims, no global verdict).');
