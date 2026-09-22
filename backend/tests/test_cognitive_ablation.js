'use strict';

const assert = require('node:assert/strict');
const { runAblation, summarize, measureArm, PROBLEMS } = require('../../benchmarks/cognitive-key-ablation/ablation-harness.cjs');

// 1. Le protocole couvre 6 bras sur 3 problèmes avec besoins non vides
assert.equal(PROBLEMS.length, 3);
const ablation = runAblation();
assert.equal(ablation.protocol, 'cognitive-ablation-A-F');
assert.equal(ablation.workerCount, 3);
ablation.results.forEach((result) => {
  assert.ok(result.needs.length >= 2, `problem ${result.problem} must infer needs`);
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((arm) => {
    assert.ok(result.measurements[arm], `arm ${arm} measured for ${result.problem}`);
  });
});

// 2. Constat structurel central : D (pertinence seule) converge comme A
//    — les N meilleures clés individuellement se recouvrent
const summary = summarize(ablation);
assert.equal(summary.A.distinctRecipes, 1, 'identical workers share one recipe');
assert.ok(summary.A.totalKeyReuse > 0, 'identical recipes reuse keys');
assert.equal(summary.D.distinctRecipes, 1, 'relevance-only composition converges');
assert.equal(summary.D.meanPairwiseDistance, 0, 'relevance-only distance is zero');
assert.ok(summary.D.unionNeedsCoverage > 0, 'single recipe still covers needs');

// 3. E (pertinence + diversité) domine D sur la diversité sans perdre
//    la couverture d'union
assert.ok(summary.E.distinctRecipes > summary.D.distinctRecipes,
  'portfolio must produce more distinct recipes than relevance-only');
assert.ok(summary.E.meanPairwiseDistance > summary.D.meanPairwiseDistance,
  'portfolio distance must exceed relevance-only');
assert.ok(summary.E.unionNeedsCoverage >= summary.D.unionNeedsCoverage - 0.001,
  'diversity must not sacrifice union coverage');
assert.ok(summary.E.totalKeyReuse < summary.A.totalKeyReuse,
  'portfolio must reuse fewer keys than identical workers');

// 4. B et C : pas de recettes cognitives (la différence vit ailleurs :
//    rôles métier / texte du prompt) — mesurés comme tels, pas cachés
assert.equal(summary.B.distinctRecipes, 0);
assert.equal(summary.C.distinctRecipes, 0);
assert.equal(summary.B.unionNeedsCoverage, 0);
assert.equal(summary.C.unionNeedsCoverage, 0);

// 5. F : déclaré non implémenté (point 9 NCE), jamais prétendu mesuré
assert.equal(summary.F.nceImplemented, false);
assert.equal(summary.F.distinctRecipes, summary.E.distinctRecipes, 'F falls back to E recipes');

// 6. Tensions inter-workers : E en produit (matière de confrontation),
//    B/C aucun (rien à confronter)
assert.ok(summary.E.crossTensions > 0, 'portfolio exposes cross-tensions');
assert.equal(summary.B.crossTensions, 0);
assert.equal(summary.C.crossTensions, 0);

// 7. Déterminisme : deux exécutions → mêmes métriques
const second = summarize(runAblation());
assert.deepEqual(summary, second);

// 8. measureArm est injectable (bras synthétique)
const synthetic = measureArm([
  { keys: ['cognitive.falsification-search'] },
  { keys: ['cognitive.structural-abstraction'] }
], ['causal_uncertainty', 'complexity']);
assert.equal(synthetic.recipeCount, 2);
assert.equal(synthetic.distinctRecipes, 2);
assert.ok(synthetic.meanPairwiseDistance > 0);
assert.ok(synthetic.unionNeedsCoverage > 0);

console.log(
  `Cognitive ablation tests passed (3 problems × 6 arms; ` +
  `E diversity ${summary.E.distinctRecipes} vs D ${summary.D.distinctRecipes}, ` +
  `distance ${summary.E.meanPairwiseDistance} vs ${summary.D.meanPairwiseDistance}).`
);
