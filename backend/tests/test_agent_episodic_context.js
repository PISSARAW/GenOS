const assert = require('node:assert/strict');
const context = require('../src/services/agentMemoryContext');
const vectorMemory = require('../src/services/vectorMemoryService');
const episodic = require('../src/services/episodicMemoryService');

const originalSearch = vectorMemory.searchMemory;
const originalEpisodes = episodic.getRecentEpisodes;
vectorMemory.searchMemory = async () => ({ allScoredExperiences: [], pitfallsToAvoid: [], topSuccessfulGoldenPaths: [] });
episodic.getRecentEpisodes = async () => [
  { actionType: 'deploy', observationOutput: 'Canary passed', rewardScore: 0.9 },
  { actionType: 'failed', observationOutput: 'Unverified failure', rewardScore: 0.2 }
];
context.formatCognitiveMemoryPrompt('agent-episodic', 'deploy service')
  .then((prompt) => {
    assert.match(prompt, /Épisodes récents consolidés/);
    assert.match(prompt, /Canary passed/);
    assert.doesNotMatch(prompt, /Unverified failure/);
    console.log('Agent episodic context checks passed.');
  })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { vectorMemory.searchMemory = originalSearch; episodic.getRecentEpisodes = originalEpisodes; });
