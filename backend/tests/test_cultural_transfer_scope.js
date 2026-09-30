'use strict';

const assert = require('node:assert/strict');
const { createCulturalArtifact } = require('../src/services/culturalTransmissionService');
const { enhanceMissionWithNCE } = require('../src/services/nceIntegrationService');

function hasCapability(state, capability) {
  return Number(state.branches.some((branch) => branch.capabilities.includes(capability)));
}

async function main() {
  const state = { currentPhenotype: { role: 'solver' }, branches: [], atrophies: [], history: [] };
  const before = { planning: hasCapability(state, 'planning'), analysis: hasCapability(state, 'analysis') };
  const artifact = createCulturalArtifact({ agentId: 'teacher', type: 'procedure', quality: 1,
    content: { requiredCapabilities: ['planning'] } });
  const result = await enhanceMissionWithNCE({
    culturalTraits: [],
    culturalTransfer: { phenotypeState: state, artifact, benchmark: async () => hasCapability(state, 'planning') },
    nceOptions: { curiosity: false, reprMutation: false, exaptation: false, envCoev: false, play: false, phenotype: false, culture: true },
  }, null);
  const after = { planning: hasCapability(state, 'planning'), analysis: hasCapability(state, 'analysis') };
  assert.deepEqual(before, { planning: 0, analysis: 0 });
  assert.deepEqual(after, { planning: 1, analysis: 0 });
  assert.equal(result.culturalLearning.transfer.before, 0);
  assert.equal(result.culturalLearning.transfer.after, 1);
  assert.equal(result.culturalLearning.phenotype.changed, true);
  console.log('Cultural transfer scope: same-task score 0→1; unrelated capability remains 0.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
