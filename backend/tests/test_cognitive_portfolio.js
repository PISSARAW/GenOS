'use strict';

const assert = require('node:assert/strict');
const {
  phenotypeEnabled,
  inferCognitiveNeeds,
  phenotypeFromRecipe,
  formatPhenotypePrompt,
  attachPhenotypesToPlan,
  activeMembers
} = require('../src/services/cognitivePhenotypeService');
const {
  composePortfolio,
  portfolioMetrics,
  recipeDistance,
  crossTensions,
  jaccardDistance
} = require('../src/cognition/cognitivePortfolio');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');

const KEY_MAP = new Map(COGNITIVE_KEYS.map((key) => [key.id, key]));

function sampleMember(index = 0) {
  return {
    label: `branch_${index + 1}`,
    role: 'backend_engineer',
    hypothesis: 'Own the domain and return evidence.',
    capabilities: ['backend'],
    pipelineStage: 0,
    dependsOn: []
  };
}

function samplePlan(members) {
  return { dispatchWorkers: members };
}

const MISSION_TEXT = 'Investigate why causal uncertainty persists and the representation lock in blocks debugging.';

// 1. Feature flag : défaut off (opt-in, prérequis ablation point 7)
assert.equal(phenotypeEnabled({}), false);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '1' }), true);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: 'on' }), true);

// 2. Inférence des besoins
const needs = inferCognitiveNeeds(MISSION_TEXT);
assert.ok(needs.includes('causal_uncertainty'));
assert.ok(needs.includes('debugging'));
assert.ok(needs.includes('representation_lock_in'));
assert.deepEqual(inferCognitiveNeeds(''), []);

// 3. Jaccard : sanity
assert.equal(jaccardDistance(['a', 'b'], ['a', 'b']), 0);
assert.equal(jaccardDistance(['a'], ['b']), 1);
assert.ok(jaccardDistance(['a', 'b'], ['b', 'c']) > 0 && jaccardDistance(['a', 'b'], ['b', 'c']) < 1);

// 4. Portfolio : N recettes distinctes, distance mesurée
const portfolio = composePortfolio({
  id: 'recipe.test-portfolio',
  label: 'Portfolio test',
  needs,
  recipeCount: 3,
  options: { maxKeys: 4, maxCostWeight: 8 }
});
assert.equal(portfolio.recipes.length, 3);
assert.ok(portfolio.metrics.meanPairwiseDistance > 0, 'portfolio must be cognitively diverse');
assert.ok(portfolio.metrics.minPairwiseDistance > 0, 'no two recipes may be identical');
const keySets = portfolio.recipes.map((r) => r.keys.join('|'));
assert.equal(new Set(keySets).size, 3, 'recipes must be pairwise distinct');
assert.ok(portfolio.metrics.pairwiseDistances.length === 3); // C(3,2)

// 5. La diversité du portfolio domine le composer seul (même besoins, sans bias)
//    Chaque recette du portfolio doit couvrir au moins un besoin de la mission
portfolio.recipes.forEach((recipe) => {
  const covered = recipe.keys.flatMap((keyId) => (KEY_MAP.get(keyId) || { usefulWhen: [] }).usefulWhen);
  assert.ok(
    needs.some((need) => covered.includes(need)),
    `recipe ${recipe.id} must cover at least one mission need`
  );
});

// 6. Distance paire-à-paire : identiques → 0, disjointes → élevée
const recipeA = { id: 'r.a', keys: ['cognitive.falsification-search'] };
const recipeB = { id: 'r.b', keys: ['cognitive.falsification-search'] };
assert.equal(recipeDistance(recipeA, recipeB, KEY_MAP), 0);
const recipeC = { id: 'r.c', keys: ['cognitive.structural-abstraction'] };
assert.ok(recipeDistance(recipeA, recipeC, KEY_MAP) > 0);

// 7. Tensions inter-recettes : conflit déclaré entre deux recettes distinctes
const tensionPair = composePortfolio({
  id: 'recipe.test-tension',
  needs: ['complexity', 'category_reification'],
  recipeCount: 2,
  options: { maxKeys: 2, maxCostWeight: 6, diversityWeight: 1.5 }
});
if (tensionPair.metrics.crossTensions.length > 0) {
  const tension = tensionPair.metrics.crossTensions[0];
  assert.notEqual(tension.a.recipe, tension.b.recipe, 'cross-tension spans two recipes');
  assert.ok(tension.a.key && tension.b.key);
} else {
  // sans tension émergente, la métrique doit être vide proprement
  assert.deepEqual(tensionPair.metrics.crossTensions, []);
}

// 8. phenotypeFromRecipe : instructions opérationnelles, pas de provenance
const phenotype = phenotypeFromRecipe(portfolio.recipes[0]);
assert.ok(phenotype);
assert.ok(phenotype.recipeId.startsWith('recipe.'));
assert.ok(phenotype.instructions.length === phenotype.keys.length);
assert.ok(phenotype.instructions.every((entry) => entry.instruction.length >= 40));
assert.ok(!JSON.stringify(phenotype).includes('derivedFrom'));
assert.equal(phenotypeFromRecipe(null), null);
assert.equal(phenotypeFromRecipe({ keys: [] }), null);

// 9. Bloc prompt
const block = formatPhenotypePrompt(phenotype);
assert.ok(block.startsWith('Cognitive phenotype for this mission'));
assert.equal(formatPhenotypePrompt(null), null);

// 10. Attachement au plan : disabled par défaut
const disabledReport = attachPhenotypesToPlan({ plan: samplePlan([sampleMember()]), missionText: MISSION_TEXT });
assert.equal(disabledReport.attached, 0);
assert.equal(disabledReport.reason, 'disabled');

// 11. Attachement activé : portfolio + métriques exposées
const originalEnv = process.env.GENOS_COGNITIVE_PHENOTYPE;
process.env.GENOS_COGNITIVE_PHENOTYPE = '1';
try {
  const members = [sampleMember(), sampleMember(1), sampleMember(2)];
  const report = attachPhenotypesToPlan({ plan: samplePlan(members), missionText: MISSION_TEXT });
  assert.equal(report.attached, 3);
  assert.ok(report.portfolio, 'portfolio metrics must be exposed');
  assert.ok(report.portfolio.meanPairwiseDistance > 0);
  assert.ok(report.portfolio.recipeCount === 3);
  members.forEach((member) => {
    assert.ok(member.cognitiveRecipe, `member ${member.label} must carry a recipe`);
  });
  const attachedSets = members.map((m) => m.cognitiveRecipe.keys.join('|'));
  assert.equal(new Set(attachedSets).size, 3, 'attached recipes must be distinct');

  // plan sans workers
  const noWorkers = attachPhenotypesToPlan({ plan: {}, missionText: MISSION_TEXT });
  assert.equal(noWorkers.attached, 0);
  assert.equal(noWorkers.reason, 'no_members');
} finally {
  if (originalEnv === undefined) delete process.env.GENOS_COGNITIVE_PHENOTYPE;
  else process.env.GENOS_COGNITIVE_PHENOTYPE = originalEnv;
}

// 12. Intégration buildWorkerPrompt : le bloc phénotype est injecté
const { buildWorkerPrompt } = require('../src/services/agentFleetWorkers');
const memberWithRecipe = sampleMember();
memberWithRecipe.cognitiveRecipe = phenotype;
const prompt = buildWorkerPrompt({
  identity: { introduction: 'You are a worker.' },
  conscience: { dissonanceLevel: 0 },
  assignment: memberWithRecipe,
  context: {
    mission: { prompt: 'Do the mission.' },
    parent: { current_task: 'Do the mission.' },
    plan: { tokenPolicy: { allocation: 'uniform', total: 10000 } },
    perWorkerTokens: 5000
  }
});
assert.ok(prompt.includes('Cognitive phenotype for this mission'));
const barePrompt = buildWorkerPrompt({
  identity: { introduction: 'You are a worker.' },
  conscience: { dissonanceLevel: 0 },
  assignment: sampleMember(1),
  context: {
    mission: { prompt: 'Do the mission.' },
    parent: { current_task: 'Do the mission.' },
    plan: { tokenPolicy: { allocation: 'uniform', total: 10000 } },
    perWorkerTokens: 5000
  }
});
assert.ok(!barePrompt.includes('Cognitive phenotype'));

console.log(
  `Cognitive portfolio tests passed (${COGNITIVE_KEYS.length} keys, ` +
  `${portfolio.recipes.length} recipes, mean distance ${portfolio.metrics.meanPairwiseDistance}).`
);
