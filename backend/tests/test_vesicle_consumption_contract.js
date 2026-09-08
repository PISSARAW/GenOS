const assert = require('node:assert/strict');
const context = require('../src/services/agentMemoryContext');
const vectorMemory = require('../src/services/vectorMemoryService');

const calls = [];
const originalSearch = vectorMemory.searchMemory;
const originalUptake = vectorMemory.uptakeVesicles;
vectorMemory.searchMemory = async () => ({ allScoredExperiences: [], pitfallsToAvoid: [], topSuccessfulGoldenPaths: [] });
vectorMemory.uptakeVesicles = async (agentId, options) => { calls.push({ agentId, options }); return []; };

Promise.all([
  context.formatCognitiveMemoryPrompt('agent', 'task'),
  context.formatCognitiveMemoryPrompt('agent', 'task', { peekVesicles: true })
]).then(() => {
  assert.equal(calls.some((call) => call.options.peek === false), true);
  assert.equal(calls.some((call) => call.options.peek === true), true);
  console.log('Vesicle consumption contract checks passed.');
}).catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { vectorMemory.searchMemory = originalSearch; vectorMemory.uptakeVesicles = originalUptake; });
