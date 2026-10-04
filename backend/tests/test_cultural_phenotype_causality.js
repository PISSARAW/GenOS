'use strict';

const assert = require('node:assert/strict');
const { createCulturalArtifact } = require('../src/services/culturalTransmissionService');
const { enhanceMissionWithNCE } = require('../src/services/nceIntegrationService');

function phenotypeState() {
  return { currentPhenotype: { role: 'solver' }, branches: [], atrophies: [], history: [] };
}

function benchmarkFor(state) {
  return async () => {
    const plannerAvailable = state.branches.some((branch) => branch.capabilities.includes('planning'));
    const moves = plannerAvailable ? ['down', 'right', 'right'] : ['right', 'right', 'down'];
    let x = 0;
    let y = 0;
    for (const move of moves) {
      if (move === 'right') x += 1;
      if (move === 'down') y += 1;
      if (x === 1 && y === 0) return 0;
    }
    return Number(x === 2 && y === 1);
  };
}

async function runTransfer(artifact) {
  const state = phenotypeState();
  const enhancements = await enhanceMissionWithNCE({
    culturalTraits: [],
    culturalTransfer: { phenotypeState: state, artifact, benchmark: benchmarkFor(state) },
    nceOptions: {
      curiosity: false, reprMutation: false, exaptation: false, envCoev: false,
      play: false, phenotype: false, culture: true,
    },
  }, null);
  return { state, result: enhancements.culturalLearning };
}

async function main() {
  const useful = createCulturalArtifact({
    agentId: 'teacher', type: 'procedure', quality: 1,
    content: { requiredCapabilities: ['planning'] },
  });
  const positive = await runTransfer(useful);
  assert.equal(positive.result.transfer.before, 0);
  assert.equal(positive.result.transfer.after, 1);
  assert.equal(positive.result.phenotype.changed, true);
  assert.equal(positive.state.history[0].culturalArtifactId, useful.id);

  const irrelevant = createCulturalArtifact({ agentId: 'teacher', type: 'story', content: { text: 'unrelated' }, quality: 1 });
  const negative = await runTransfer(irrelevant);
  assert.equal(negative.result.transfer.delta, 0);
  assert.equal(negative.result.phenotype.changed, false);
  const unrelated = createCulturalArtifact({ agentId: 'teacher', type: 'procedure', quality: 1,
    content: { requiredCapabilities: ['storytelling'] } });
  const control = await runTransfer(unrelated);
  assert.equal(control.result.phenotype.changed, true);
  assert.equal(control.result.transfer.delta, 0,
    'a phenotype change unrelated to the fixed grid task must not improve the score');
  const unmeasuredState = phenotypeState();
  const unmeasured = await enhanceMissionWithNCE({
    culturalTransfer: { phenotypeState: unmeasuredState, artifact: useful },
    nceOptions: { curiosity: false, reprMutation: false, exaptation: false,
      envCoev: false, play: false, phenotype: false, culture: true },
  }, null);
  assert.equal(unmeasured.culturalLearning.transfer.measured, false);
  assert.equal(unmeasured.culturalLearning.phenotype.changed, true);
  console.log('Cultural learning to phenotype causality: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
