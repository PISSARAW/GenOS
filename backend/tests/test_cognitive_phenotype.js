'use strict';

const assert = require('node:assert/strict');
const {
  phenotypeEnabled,
  inferCognitiveNeeds,
  buildWorkerPhenotype,
  formatPhenotypePrompt,
  attachPhenotypesToPlan,
  activeMembers
} = require('../src/services/cognitivePhenotypeService');
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

// 1. Feature flag : défaut off (opt-in, prérequis ablation point 7)
assert.equal(phenotypeEnabled({}), false);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '' }), false);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '0' }), false);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: '1' }), true);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: 'true' }), true);
assert.equal(phenotypeEnabled({ GENOS_COGNITIVE_PHENOTYPE: 'on' }), true);

// 2. Inférence des besoins : vocabulaire usefulWhen matché (underscores = espaces)
const missionText = 'Investigate why causal uncertainty persists and the representation lock in blocks debugging.';
const needs = inferCognitiveNeeds(missionText);
assert.ok(needs.includes('causal_uncertainty'), `needs: ${needs.join(',')}`);
assert.ok(needs.includes('debugging'));
assert.ok(needs.includes('representation_lock_in'));
assert.deepEqual(inferCognitiveNeeds(''), []);
assert.deepEqual(inferCognitiveNeeds(null), []);

// 3. Phénotype par worker : recette valide + instructions opérationnelles
const phenotype = buildWorkerPhenotype({
  member: sampleMember(),
  needs: ['causal_uncertainty', 'debugging'],
  index: 0,
  options: { maxKeys: 4, maxCostWeight: 8 }
});
assert.ok(phenotype, 'phenotype must compose');
assert.ok(phenotype.recipeId.startsWith('recipe.mission-worker-'));
assert.ok(phenotype.keys.length >= 1 && phenotype.keys.length <= 4);
assert.ok(phenotype.instructions.length === phenotype.keys.length);
assert.ok(phenotype.instructions.every((entry) => entry.instruction.length >= 40));
// Indépendance doctrinale : la provenance n'est PAS dans le phénotype
assert.ok(!JSON.stringify(phenotype).includes('derivedFrom'));

// 4. Bloc prompt : header + lignes + tensions productives éventuelles
const block = formatPhenotypePrompt(phenotype);
assert.ok(block.startsWith('Cognitive phenotype for this mission'));
assert.ok(block.includes('- '));
const tensionPhenotype = buildWorkerPhenotype({
  member: sampleMember(1),
  needs: ['complexity', 'category_reification'],
  index: 1,
  options: { maxKeys: 4, maxCostWeight: 12 }
});
if (tensionPhenotype && tensionPhenotype.tensions.length > 0) {
  const tensionBlock = formatPhenotypePrompt(tensionPhenotype);
  assert.ok(tensionBlock.includes('Productive tensions'));
}
assert.equal(formatPhenotypePrompt(null), null);
assert.equal(formatPhenotypePrompt({ instructions: [] }), null);

// 5. Attachement au plan : disabled par défaut
const disabledReport = attachPhenotypesToPlan({
  plan: samplePlan([sampleMember(), sampleMember(1)]),
  missionText
});
assert.equal(disabledReport.attached, 0);
assert.equal(disabledReport.reason, 'disabled');

// 6. Attachement au plan : activé via env
const originalEnv = process.env.GENOS_COGNITIVE_PHENOTYPE;
process.env.GENOS_COGNITIVE_PHENOTYPE = '1';
try {
  const members = [sampleMember(), sampleMember(1), sampleMember(2)];
  const report = attachPhenotypesToPlan({ plan: samplePlan(members), missionText });
  assert.equal(report.attached, 3);
  assert.ok(report.needs.length >= 2);
  members.forEach((member) => {
    assert.ok(member.cognitiveRecipe, `member ${member.label} must carry a recipe`);
    assert.ok(member.cognitiveRecipe.keys.length >= 1);
  });
  // Diversité : les recettes des workers sur les mêmes besoins divergent
  // (gain marginal décroissant → le composer n'a pas de raison de produire
  //  des recettes identiques quand le registre est large)
  const keySets = members.map((m) => m.cognitiveRecipe.keys.join('|'));
  assert.equal(new Set(keySets).size, keySets.length, 'recipes must be distinct across workers');
} finally {
  if (originalEnv === undefined) delete process.env.GENOS_COGNITIVE_PHENOTYPE;
  else process.env.GENOS_COGNITIVE_PHENOTYPE = originalEnv;
}

// 7. Plan sans workers : pas de phénotype
process.env.GENOS_COGNITIVE_PHENOTYPE = '1';
try {
  const noWorkers = attachPhenotypesToPlan({ plan: {}, missionText });
  assert.equal(noWorkers.attached, 0);
  const noNeeds = attachPhenotypesToPlan({ plan: samplePlan([sampleMember()]), missionText: 'nothing matches here hopefully' });
  assert.equal(noNeeds.attached, 0);
  assert.equal(noNeeds.reason, 'no_needs_inferred');
} finally {
  if (originalEnv === undefined) delete process.env.GENOS_COGNITIVE_PHENOTYPE;
  else process.env.GENOS_COGNITIVE_PHENOTYPE = originalEnv;
}

// 8. activeMembers : dispatchWorkers uniquement
assert.equal(activeMembers({}).length, 0);
assert.equal(activeMembers(samplePlan([sampleMember()])).length, 1);

// 9. Le prompt worker intègre le bloc phénotype (intégration buildWorkerPrompt)
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
assert.ok(prompt.includes(phenotype.instructions[0].instruction.slice(0, 30)));
const memberWithoutRecipe = sampleMember(1);
const barePrompt = buildWorkerPrompt({
  identity: { introduction: 'You are a worker.' },
  conscience: { dissonanceLevel: 0 },
  assignment: memberWithoutRecipe,
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
