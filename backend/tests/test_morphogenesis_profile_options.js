'use strict';

const assert = require('node:assert/strict');
const { MorphogenesisRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');

async function run() {
  const runtime = new MorphogenesisRuntime();
  const proposal = await runtime.prepareMorphology({
    profile: { fork_count: 8, domains: ['legacy'] },
    selected_strategy: { primary: 'counterfactual_forks' }
  }, { fork_count: 2, domains: ['biology', 'topology'], profile: { primaryDomain: 'biology' } });
  assert.equal(proposal.agents.length, 3);
  assert.deepEqual(proposal.domains, ['biology', 'topology']);
  assert.equal(proposal.primaryDomain, 'biology');

  const bounded = await runtime.prepareMorphology({ selected_strategy: { primary: 'counterfactual_forks' } }, { fork_count: 1000 });
  assert.equal(bounded.agents.length, 65);
  console.log('Morphogenesis profile options: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
