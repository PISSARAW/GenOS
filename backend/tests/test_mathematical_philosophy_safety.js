'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');

async function run() {
  const evaluated = await router.handlePhilosophyRequest({ request: {
    operation: 'evaluateConcept',
    arguments: { concept: 'mathematics.platonism' }
  } });
  assert.equal(evaluated.executable, false);
  assert.equal(evaluated.supported, false);
  assert.equal(evaluated.service, null);

  await assert.rejects(() => router.handlePhilosophyRequest({ request: {
    operation: 'applyRuntimeEffect',
    arguments: { concept: 'mathematics.platonism', agentId: 'agent-test', apply: true }
  } }), /not allow-listed|unsupported|unknown/i);

  console.log('Mathematical philosophy safety tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
