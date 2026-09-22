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
const { composePortfolio } = require('../src/cognition/cognitivePortfolio');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');

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
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '' }), false);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '0' }), false);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '1' }), true);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: 'true' }), true);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: 'on' }), true);

// 2. Inférence des besoins : vocabulaire usefulWhen matché (underscores = espaces)
const needs = inferCognitiveNeeds(MISSION_TEXT);
assert.ok(needs.includes('causal_uncertainty'));
assert.ok(needs.includes('debugging'));
assert.ok(needs.includes('representation_lock_in'));
assert.deepEqual(inferCognitiveNeeds(''), []);
assert.deepEqual(inferCognitiveNeeds(null), []);

// 3. activeMembers : dispatchWorkers uniquement
assert.equal(activeMembers({}).length, 0);
assert.equal(activeMembers(samplePlan([sampleMember()])).length, 1);

// 4. Attachement au plan : disabled par défaut
const disabledReport = attachPhenotypesToPlan({ plan: samplePlan([sampleMember()]), missionText: MISSION_TEXT });
assert.equal(disabledReport.attached, 0);
assert.equal(disabledReport.reason, 'disabled');

// 5. Attachement activé via env : portfolio + plan.cognitivePortfolio exposé
const originalEnv = process.env.GENOS_COGNITIVE_PHENOTYPE;
process.env.GENOS_COGNITIVE_PHENOTYPE = '1';
try {
  const members = [sampleMember(), sampleMember(1), sampleMember(2)];
  const plan = samplePlan(members);
  const report = attachPhenotypesToPlan({ plan, missionText: MISSION_TEXT });
  assert.equal(report.attached, 3);
  assert.ok(report.needs.length >= 2);
  assert.ok(report.portfolio, 'portfolio metrics must be exposed');
  assert.ok(report.portfolio.meanPairwiseDistance > 0);
  assert.ok(plan.cognitivePortfolio, 'plan must carry the portfolio for the synthesis barrier');
  assert.equal(plan.cognitivePortfolio.recipes.length, 3);
  members.forEach((member) => {
    assert.ok(member.cognitiveRecipe, `member ${member.label} must carry a recipe`);
    assert.ok(member.cognitiveRecipe.keys.length >= 1);
  });
  const keySets = members.map((m) => m.cognitiveRecipe.keys.join('|'));
  assert.equal(new Set(keySets).size, 3, 'attached recipes must be distinct');

  // plan sans workers
  const emptyPlan = samplePlan([]);
  const noWorkers = attachPhenotypesToPlan({ plan: emptyPlan, missionText: MISSION_TEXT });
  assert.equal(noWorkers.attached, 0);
  assert.equal(noWorkers.reason, 'no_members');
  const noNeeds = attachPhenotypesToPlan({ plan: samplePlan([sampleMember()]), missionText: 'rien a matcher ici' });
  assert.equal(noNeeds.attached, 0);
  assert.equal(noNeeds.reason, 'no_needs_inferred');
} finally {
  if (originalEnv === undefined) delete process.env.GENOS_COGNITIVE_PHENOTYPE;
  else process.env.GENOS_COGNITIVE_PHENOTYPE = originalEnv;
}

// 6. phenotypeFromRecipe : instructions opérationnelles, pas de provenance
const portfolio = composePortfolio({ id: 'recipe.pheno-test', needs, recipeCount: 2, options: { maxKeys: 3, maxCostWeight: 6 } });
const phenotype = phenotypeFromRecipe(portfolio.recipes[0]);
assert.ok(phenotype);
assert.ok(phenotype.recipeId.startsWith('recipe.'));
assert.ok(phenotype.instructions.length === phenotype.keys.length);
assert.ok(phenotype.instructions.every((entry) => entry.instruction.length >= 40));
assert.ok(!JSON.stringify(phenotype).includes('derivedFrom'));
assert.equal(phenotypeFromRecipe(null), null);
assert.equal(phenotypeFromRecipe({ keys: [] }), null);

// 7. Bloc prompt : header + tensions productives éventuelles
const block = formatPhenotypePrompt(phenotype);
assert.ok(block.startsWith('Cognitive phenotype for this mission'));
assert.ok(block.includes('- '));
assert.equal(formatPhenotypePrompt(null), null);
assert.equal(formatPhenotypePrompt({ instructions: [] }), null);

// 8. Intégration buildWorkerPrompt : le bloc phénotype est injecté
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
  `Cognitive phenotype tests passed (${COGNITIVE_KEYS.length} keys, ` +
  `${needs.length} needs inferred, phenotype block ${block.length} chars).`
);
