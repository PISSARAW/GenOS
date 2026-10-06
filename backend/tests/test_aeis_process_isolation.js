'use strict';

const assert = require('node:assert/strict');
const { runPopulation, runIsolatedPopulations, safeEnvironment } = require('../src/services/epistemic/processIsolatedMetapopulationRunner');

async function main() {
  const previousOpenai = process.env.OPENAI_API_KEY;
  const previousAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = 'aeis-openai-test';
  process.env.ANTHROPIC_API_KEY = 'aeis-anthropic-test';
  const scoped = safeEnvironment({ provider: 'openai', environment: { ANTHROPIC_API_KEY: 'injected' } });
  assert.equal(scoped.OPENAI_API_KEY, 'aeis-openai-test');
  assert.equal(scoped.ANTHROPIC_API_KEY, undefined);
  assert.equal(scoped.GENOS_DISABLE_DOTENV, '1');
  assert.equal(scoped.GENOS_DB_PATH, ':memory:');
  assert.equal(scoped.GENOS_DB_BACKUP_SKIP, '1');
  if (previousOpenai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenai;
  if (previousAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = previousAnthropic;
  await assert.rejects(runPopulation({ provider: 'openai' }), (error) => error.code === 'AEIS_POPULATION_INPUT_INVALID');
  const failed = await runIsolatedPopulations([{ provider: 'unsupported', model: 'unsupported://missing', prompt: 'independent claim' }]);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].status, 'error');
  await assert.rejects(runPopulation({ provider: 'openai', model: 'anthropic://same', prompt: 'claim' }),
    (error) => error.code === 'AEIS_POPULATION_INPUT_INVALID');
  await assert.rejects(runIsolatedPopulations(new Array(9).fill({})),
    (error) => error.code === 'AEIS_POPULATION_LIMIT');
  console.log('AEIS populations use separate child processes and report isolated failures.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
