'use strict';

const assert = require('node:assert/strict');
const {
  applyCognitiveSynthesis,
  positionsFromDossiers,
  confrontPositions,
  synthesizePositions,
  hasCognitiveMatter
} = require('../src/services/cognitiveSynthesisService');
const { composePortfolio } = require('../src/cognition/cognitivePortfolio');

function workerWith(recipe, agentId) {
  return { agentId, cognitiveRecipe: recipe };
}

function dossierFor(agentId, report) {
  return { workerId: agentId, events: [{ payload: { evidenceReport: report } }] };
}

// Portfolio réel : 3 recettes divergentes sur les mêmes besoins
const { phenotypeFromRecipe } = require('../src/services/cognitivePhenotypeService');
const needs = ['complexity', 'category_reification', 'causal_uncertainty', 'representation_lock_in'];
const portfolio = composePortfolio({ id: 'recipe.synth-test', needs, recipeCount: 3, options: { maxKeys: 3, maxCostWeight: 8 } });
assert.equal(portfolio.recipes.length, 3);
const phenotypes = portfolio.recipes.map((recipe) => phenotypeFromRecipe(recipe));
assert.ok(phenotypes.every(Boolean));
const [r1, r2, r3] = phenotypes;

// 1. Positions extraites des dossiers, recettes propagées
const workers = [
  workerWith(r1, 'w-1'),
  workerWith(r2, 'w-2'),
  workerWith(r3, 'w-3')
];
const dossiers = [
  dossierFor('w-1', { outcome: 'success', claims: ['la croissance quadratique cause la congestion'], tests: ['ablation dun canal'], uncertainties: ['latence réseau'] }),
  dossierFor('w-2', { outcome: 'success', claims: ['la topologie seule explique la congestion'], tests: ['isolation des composants'], uncertainties: [] }),
  dossierFor('w-3', { outcome: 'success', claims: ['le cadrage du problème masque la cause'], tests: ['recadrage élargi'], uncertainties: ['généralité'] })
];
const positions = positionsFromDossiers(workers, dossiers);
assert.equal(positions.length, 3);
assert.ok(positions.every((p) => p.recipeId && p.recipeKeys.length > 0));
assert.ok(positions.every((p) => p.claims.length === 1));

// 2. hasCognitiveMatter : >= 2 recettes distinctes
assert.equal(hasCognitiveMatter(positions), true);
assert.equal(hasCognitiveMatter([positions[0]]), false);
assert.equal(hasCognitiveMatter([positions[0], positions[0]]), false);

// 3. Confrontation : tensions avec matière uniquement
const confrontations = confrontPositions(positions, portfolio.metrics.crossTensions);
confrontations.forEach((c) => {
  assert.equal(c.expressed, true);
  assert.ok(c.positions.a && c.positions.b);
  assert.ok(c.positions.a.claims.length > 0 && c.positions.b.claims.length > 0);
  assert.notEqual(c.recipes.a, c.recipes.b);
});
// une tension sans dossier des deux côtés est écartée
const emptyConfrontations = confrontPositions([positions[0]], portfolio.metrics.crossTensions);
assert.equal(emptyConfrontations.length, 0);

// 4. Synthèse structurelle : conditions de validité + niveau commun + résidu
const synthesis = synthesizePositions(positions, confrontations);
assert.equal(synthesis.synthesisLevel, 'structural');
assert.equal(synthesis.reconciledPositions, 3);
assert.equal(synthesis.validityConditions.length, 3);
synthesis.validityConditions.forEach((condition) => {
  assert.ok(condition.recipeId);
  assert.ok(Array.isArray(condition.testedBy));
  assert.ok(typeof condition.claimCount === 'number');
});
assert.ok(Array.isArray(synthesis.commonKeys));
assert.equal(synthesis.irreconcilableResidue.length, confrontations.length);
synthesis.irreconcilableResidue.forEach((residue) => {
  assert.equal(residue.unresolved, true);
  assert.ok(residue.keys.a && residue.keys.b);
});

// 5. applyCognitiveSynthesis : plan sans portfolio → null (barrier inerte)
async function main() {
const noPortfolio = await applyCognitiveSynthesis({ agentId: 'orch', workers, autonomyPlan: {} });
assert.equal(noPortfolio, null);

// 6. applyCognitiveSynthesis : plan avec portfolio → synthèse exposée
const plan = { cognitivePortfolio: { recipes: portfolio.recipes, metrics: portfolio.metrics } };
const result = await applyCognitiveSynthesis({ agentId: 'orch', workers, autonomyPlan: plan, usable: dossiers });
assert.ok(plan.cognitiveSynthesis);
assert.equal(plan.cognitiveSynthesis.applied, true);
assert.equal(plan.cognitiveSynthesis.openConfrontations, confrontations.length);
assert.ok(plan.cognitiveSynthesis.synthesis.reconciledPositions === 3);

// 7. applyCognitiveSynthesis : workers sans recette → insufficient
const barePlan = { cognitivePortfolio: { recipes: portfolio.recipes, metrics: portfolio.metrics } };
const bareResult = await applyCognitiveSynthesis({
  agentId: 'orch',
  workers: [{ agentId: 'w-1' }, { agentId: 'w-2' }],
  autonomyPlan: barePlan,
  usable: [dossierFor('w-1', { claims: ['a'] }), dossierFor('w-2', { claims: ['b'] })]
});
assert.equal(barePlan.cognitiveSynthesis.applied, false);
assert.equal(barePlan.cognitiveSynthesis.reason, 'insufficient_diverse_positions');

// 8. Le worker porte sa recette (propagation agentFleetWorkers)
const { buildWorkerPrompt } = require('../src/services/agentFleetWorkers');
const worker = workerWith(r1, 'w-1');
assert.ok(worker.cognitiveRecipe.recipeId.startsWith('recipe.'));
const prompt = buildWorkerPrompt({
  identity: { introduction: 'You are a worker.' },
  conscience: { dissonanceLevel: 0 },
  assignment: { label: 'branch', hypothesis: 'h', cognitiveRecipe: worker.cognitiveRecipe },
  context: {
    mission: { prompt: 'Do the mission.' },
    parent: { current_task: 'Do the mission.' },
    plan: { tokenPolicy: { allocation: 'uniform', total: 10000 } },
    perWorkerTokens: 5000
  }
});
assert.ok(prompt.includes('Cognitive phenotype'));

console.log(
  `Cognitive synthesis tests passed (${portfolio.recipes.length} recipes, ` +
  `${confrontations.length} open confrontation(s), ${synthesis.irreconcilableResidue.length} residue item(s)).`
);
}

main().catch((error) => { console.error(error); process.exit(1); });
