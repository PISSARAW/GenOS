'use strict';

const assert = require('node:assert/strict');
const { runPopulation, runIsolatedPopulations } = require('../src/services/epistemic/processIsolatedMetapopulationRunner');

async function main() {
  await assert.rejects(runPopulation({ provider: 'openai' }), (error) => error.code === 'AEIS_POPULATION_INPUT_INVALID');
  const failed = await runIsolatedPopulations([{ provider: 'openai', model: 'openai://missing', prompt: 'independent claim' }]);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].status, 'error');
  console.log('AEIS populations use separate child processes and report isolated failures.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
