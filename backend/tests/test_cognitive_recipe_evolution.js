'use strict';

const assert = require('node:assert/strict');
const {
  mutateRecipe,
  recombineRecipes,
  exaptRecipe,
  evolveRecipes
} = require('../src/cognition/cognitiveRecipeEvolution');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');
const { composePortfolio } = require('../src/cognition/cognitivePortfolio');
const { validateRecipe } = require('../src/cognition/cognitiveRecipeService');

// Recettes réelles issues du portfolio (diverses par construction)
const portfolio = composePortfolio({
  id: 'recipe.evo-test',
  needs: ['causal_uncertainty', 'complexity', 'representation_lock_in'],
  recipeCount: 2,
  options: { maxKeys: 4, maxCostWeight: 8 }
});
assert.equal(portfolio.recipes.length, 2);
const [parentA, parentB] = portfolio.recipes;

// 1. MUTATION : variantes valides uniquement
for (let i = 0; i < 20; i += 1) {
  const mutant = mutateRecipe(parentA, COGNITIVE_KEYS);
  if (!mutant) continue;
  assert.ok(mutant.keys.length >= 1);
  assert.equal(new Set(mutant.keys).size, mutant.keys.length, 'no duplicate keys');
  const check = validateRecipe(mutant, COGNITIVE_KEYS);
  assert.equal(check.valid, true, `mutant must be valid: ${check.errors.join('; ')}`);
  assert.equal(mutant.origin.operator, 'mutation');
  assert.equal(mutant.origin.parent, parentA.id);
}

// 2. MUTATION : au moins une variation utile sur 20 essais
//    (remplacement compatible ou permutation)
let variations = 0;
for (let i = 0; i < 20; i += 1) {
  const mutant = mutateRecipe(parentA, COGNITIVE_KEYS);
  if (mutant && (mutant.keys.join('|') !== parentA.keys.join('|'))) variations += 1;
}
assert.ok(variations > 0, 'mutation must produce at least one variation in 20 attempts');

// 3. RECOMBINAISON : enfants valides, sans doublon, héritage des deux parents
const children = recombineRecipes(parentA, parentB, COGNITIVE_KEYS);
if (children.length > 0) {
  children.forEach((child) => {
    assert.equal(new Set(child.keys).size, child.keys.length);
    const check = validateRecipe(child, COGNITIVE_KEYS);
    assert.equal(check.valid, true, `child must be valid: ${check.errors.join('; ')}`);
    assert.equal(child.origin.operator, 'recombination');
    assert.ok(child.origin.parents.includes(parentA.id));
    assert.ok(child.origin.parents.includes(parentB.id));
    // héritage : chaque clé de l'enfant vient d'un parent
    const parentKeys = new Set([...parentA.keys, ...parentB.keys]);
    child.keys.forEach((keyId) => assert.ok(parentKeys.has(keyId)));
  });
  // au moins un enfant hérite des deux parents (croisement réel)
  const bothParents = children.some((child) => {
    const fromA = child.keys.some((k) => parentA.keys.includes(k));
    const fromB = child.keys.some((k) => parentB.keys.includes(k));
    return fromA && fromB;
  });
  assert.ok(bothParents || children.length < 2, 'crossover must mix both parents when possible');
}

// 4. RECOMBINAISON : parents identiques → enfants = parent (pas de perte)
const selfCross = recombineRecipes(parentA, parentA, COGNITIVE_KEYS);
selfCross.forEach((child) => {
  assert.equal(new Set(child.keys).size, child.keys.length);
});

// 5. EXAPTATION : transfert vers de nouveaux besoins avec au moins une
//    clé couvrante ; sinon null (exaptation décorative refusée)
const exapted = exaptRecipe(parentA, ['debugging', 'weak_evidence'], COGNITIVE_KEYS);
if (exapted) {
  assert.ok(exapted.id.endsWith('-exapted'));
  assert.equal(exapted.origin.operator, 'exaptation');
  assert.equal(exapted.origin.parent, parentA.id);
  assert.deepEqual(exapted.objective.increase, ['debugging', 'weak_evidence']);
  const check = validateRecipe(exapted, COGNITIVE_KEYS);
  assert.equal(check.valid, true);
} else {
  // si null, vérifier qu'aucune clé ne couvre les besoins cibles
  const keyMap = new Map(COGNITIVE_KEYS.map((k) => [k.id, k]));
  const covered = parentA.keys.some((id) => {
    const key = keyMap.get(id);
    return key && key.usefulWhen.some((n) => ['debugging', 'weak_evidence'].includes(n));
  });
  assert.equal(covered, false, 'exaptation refused only when no key covers target needs');
}

// 6. EXAPTATION impossible : besoins sans aucune couverture → null
assert.equal(exaptRecipe(parentA, ['need-that-does-not-exist-anywhere'], COGNITIVE_KEYS), null);
assert.equal(exaptRecipe(null, ['debugging'], COGNITIVE_KEYS), null);

// 7. evolveRecipes : pipeline complet piloté par la performance
const performance = { [parentA.id]: 3, [parentB.id]: 1 };
const evolution = evolveRecipes({
  recipes: portfolio.recipes,
  performance,
  keys: COGNITIVE_KEYS,
  targetNeeds: ['debugging']
});
assert.ok(Array.isArray(evolution.mutants));
assert.ok(Array.isArray(evolution.recombinants));
assert.ok(Array.isArray(evolution.exaptations));
evolution.mutants.forEach((m) => assert.equal(m.origin.operator, 'mutation'));
evolution.recombinants.forEach((r) => assert.equal(r.origin.operator, 'recombination'));
evolution.exaptations.forEach((e) => assert.equal(e.origin.operator, 'exaptation'));

// 8. evolveRecipes : sans performance, pas d'évolution (pas de sélection aveugle)
const idle = evolveRecipes({ recipes: portfolio.recipes, performance: {}, keys: COGNITIVE_KEYS });
assert.equal(idle.mutants.length, 0);
assert.equal(idle.recombinants.length, 0);
assert.equal(idle.exaptations.length, 0);

// 9. Tout mutant/enfant reste dans le contrat : budget et FK vérifiés
//    par validateRecipe (déjà asserté en 1 et 3)

console.log(
  `Cognitive recipe evolution tests passed (${variations}/20 mutations varied, ` +
  `${children.length} recombinants, ${evolution.exaptations.length} exaptation(s)).`
);
