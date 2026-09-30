'use strict';

const assert = require('node:assert/strict');
const { createCulturalArtifact } = require('../src/services/culturalTransmissionService');
const { enhanceMissionWithNCE } = require('../src/services/nceIntegrationService');

function phenotypeState() {
  return { currentPhenotype: { role: 'solver' }, branches: [], atrophies: [], history: [] };
}

function benchmarkFor(state) {
  return async () => Number(state.branches.some((branch) => branch.capabilities.includes('planning')));
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
  console.log('Cultural learning to phenotype causality: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
