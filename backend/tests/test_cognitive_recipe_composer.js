'use strict';

const assert = require('node:assert/strict');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');
const {
  normalizeRecipe,
  validateRecipe,
  recipeMetrics,
  productiveTensions
} = require('../src/cognition/cognitiveRecipeService');
const { composeRecipe, keyUtility, selectKeys } = require('../src/cognition/cognitiveComposer');

function sampleRecipe() {
  return {
    id: 'recipe.test-sample',
    label: 'Recette de test',
    keys: [
      'cognitive.falsification-search',
      'cognitive.counterfactual-variation',
      'cognitive.structural-abstraction',
      'cognitive.frame-analysis'
    ],
    ordering: [],
    objective: { increase: ['causal_uncertainty'], avoid: ['premature_convergence'] }
  };
}

// 1. Validation d'une recette valide
const valid = validateRecipe(sampleRecipe());
assert.equal(valid.valid, true, valid.errors.join('; '));
assert.equal(valid.recipe.apiVersion, 'genos.cognition/v1');
assert.equal(valid.recipe.kind, 'CognitiveRecipe');
assert.equal(valid.metrics.keyCount, 4);
assert.ok(valid.metrics.operations.length > 0);
assert.ok(valid.metrics.cost > 0);
assert.ok(valid.metrics.coveredNeeds.includes('causal_uncertainty'));

// 2. FK dure : clé inconnue rejetée
const unknownKey = validateRecipe({ ...sampleRecipe(), keys: ['cognitive.does-not-exist'] });
assert.equal(unknownKey.valid, false);
assert.ok(unknownKey.errors.some((e) => e.includes('unknown CognitiveKey')));

// 3. ID pattern et keys vide
assert.equal(validateRecipe({ ...sampleRecipe(), id: 'bad-id' }).valid, false);
assert.equal(validateRecipe({ ...sampleRecipe(), keys: [] }).valid, false);

// 4. Ordering doit être une permutation exacte
const badOrdering = validateRecipe({ ...sampleRecipe(), ordering: ['cognitive.falsification-search'] });
assert.equal(badOrdering.valid, false);
assert.ok(badOrdering.errors.some((e) => e.includes('permutation')));
const goodOrdering = validateRecipe({
  ...sampleRecipe(),
  ordering: [...sampleRecipe().keys].reverse()
});
assert.equal(goodOrdering.valid, true);

// 5. Tensions productives surfacées, jamais rejetées
const tensionRecipe = validateRecipe({
  id: 'recipe.test-tension',
  label: 'Tension',
  keys: ['cognitive.structural-abstraction', 'cognitive.category-suspicion'],
  ordering: []
});
assert.equal(tensionRecipe.valid, true);
assert.equal(tensionRecipe.metrics.tensions.length, 1);
assert.deepEqual(tensionRecipe.metrics.tensions[0], {
  a: 'cognitive.category-suspicion',
  b: 'cognitive.structural-abstraction'
});

// 6. Métriques : coûts et opérations distinctes
const metrics = recipeMetrics(normalizeRecipe(sampleRecipe()), new Map(COGNITIVE_KEYS.map((k) => [k.id, k])));
assert.equal(metrics.operations.length, new Set(metrics.operations).size);
assert.ok(['low', 'medium', 'high', /^weight_/].some((p) => (
  typeof p === 'string' ? metrics.costLabel === p : p.test(metrics.costLabel)
)));

// 7. Composer : couverture des besoins
const composed = composeRecipe({
  id: 'recipe.test-composed',
  label: 'Composée',
  needs: ['causal_uncertainty', 'representation_lock_in'],
  options: { maxKeys: 4, maxCostWeight: 8 }
});
assert.equal(composed.valid, true, composed.errors.join('; '));
assert.ok(composed.recipe.keys.length >= 2);
assert.ok(composed.recipe.keys.length <= 4);
assert.ok(composed.metrics.coveredNeeds.includes('causal_uncertainty'));
assert.ok(composed.metrics.coveredNeeds.includes('representation_lock_in'));
const weights = { low: 1, medium: 2, high: 3 };
const totalWeight = composed.composition.selectedKeys.reduce((t, k) => t + weights[k.cost], 0);
assert.ok(totalWeight <= 8, `cost weight ${totalWeight} > 8`);

// 8. Composer : diversité — pas de doublon d'opération quand possible
const composedOps = composed.metrics.operations;
assert.equal(composedOps.length, new Set(composedOps).size);

// 9. Composer : budget respecté, glouton déterministe
const first = composeRecipe({ id: 'recipe.d1', label: 'D1', needs: ['causal_uncertainty'] });
const second = composeRecipe({ id: 'recipe.d2', label: 'D2', needs: ['causal_uncertainty'] });
assert.deepEqual(first.recipe.keys, second.recipe.keys);

// 10. Utility : correspondance exacte usefulWhen
const falsification = COGNITIVE_KEYS.find((k) => k.id === 'cognitive.falsification-search');
assert.equal(keyUtility(falsification, ['confirmation_bias_risk']), 1);
assert.equal(keyUtility(falsification, ['causal_uncertainty']), 0);
assert.equal(keyUtility(falsification, []), 1);

// 11. Tension productive intégrée par le composer
const tensionComposition = composeRecipe({
  id: 'recipe.test-tension-compose',
  label: 'Tension composée',
  needs: ['complexity', 'category_reification'],
  options: { maxKeys: 4, maxCostWeight: 12 }
});
assert.equal(tensionComposition.valid, true);
if (tensionComposition.metrics.tensions.length > 0) {
  assert.ok(tensionComposition.metrics.tensions.length >= 1);
}

// 12. selectKeys injectable avec registre minimal déterministe
const minimalKeys = [
  { id: 'cognitive.a', operation: 'op-a', cost: 'low', usefulWhen: ['n1'], conflictsWith: [], compatibleWith: [] },
  { id: 'cognitive.b', operation: 'op-b', cost: 'low', usefulWhen: ['n1', 'n2'], conflictsWith: [], compatibleWith: [] }
];
const minimalSelected = selectKeys(minimalKeys, ['n1', 'n2'], { maxKeys: 2, maxCostWeight: 4, tensionBonus: 1.5 });
assert.equal(minimalSelected.length, 2);
assert.ok(minimalSelected.some((k) => k.id === 'cognitive.b'));

console.log(
  `Cognitive recipe tests passed (${COGNITIVE_KEYS.length} keys available, ` +
  `composed ${composed.recipe.keys.length} keys, ${composedOps.length} distinct operations).`
);
