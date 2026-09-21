'use strict';

const assert = require('node:assert');
const V = require('../src/services/epistemic/verifierCatalogService');

const CATALOG = V.defaultCatalog();

// ---- types connus ----

assert.deepStrictEqual(
  [...V.VERIFIER_KINDS].sort(),
  ['artifact', 'benchmark', 'proof', 'replay', 'source', 'testResult'],
);

// ---- signature par défaut ----

const sig = CATALOG.testResult;
assert.strictEqual(sig.type, 'testResult');
assert.ok(typeof sig.strategy === 'object');
assert.ok(Array.isArray(sig.strategy));
assert.ok(sig.strategy.length > 0);
assert.ok(typeof sig.affinity === 'number');

// ---- épitope mapping ----

assert.strictEqual(
  V.epitopeHint({ epitopes: { evidence: { kind: 'test_result' } } }),
  'testResult'
);
assert.strictEqual(
  V.epitopeHint({ epitopes: { evidence: { kind: 'proof' } } }),
  'proof'
);
assert.strictEqual(
  V.epitopeHint({ epitopes: {} }),
  null
);

// ---- matching verifiers ----

const withHint = V.matchingVerifiers(CATALOG, {
  epitopes: { evidence: { kind: 'proof' } },
});
assert.ok(withHint.length >= 1);
assert.ok(withHint.some((v) => v.type === 'proof'));

const anyHint = V.matchingVerifiers(CATALOG, { epitopes: {} });
assert.strictEqual(anyHint.length, V.VERIFIER_KINDS.length);

// ---- clonal selection ----

const top = V.selectTopClones(CATALOG, {
  epitopes: { evidence: { kind: 'test_result' } },
}, { count: 2 });
assert.ok(top.length === 1);
assert.strictEqual(top[0].type, 'testResult');

// count hint n'expose qu'un seul match ; slice(0, 2) ne crée pas d'entrées fantômes.
assert.ok(V.selectTopClones(CATALOG, { epitopes: {} }, { count: 3 }).length >= 3);

const ranked = V.clonalRank(CATALOG, {
  epitopes: { evidence: { kind: 'benchmark' } },
}, (t) => (t === 'benchmark' ? 2 : 0.1),
);
assert.ok(ranked.length > 0);
assert.ok(ranked[0].fit >= (ranked[ranked.length - 1]?.fit || 0));

// ---- usage count / affinite initiale ----

const fresh = CATALOG.proof;
assert.strictEqual(fresh.usageCount, 0);
assert.strictEqual(fresh.successes, 0);
assert.strictEqual(fresh.failures, 0);

console.log('OK verifierCatalogService');
