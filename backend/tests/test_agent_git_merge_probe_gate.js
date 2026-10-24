'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { verifyFunctionalMerge } = require('../src/services/agentGitService/mergeProbeGate.cjs');

async function main() {
  const keys = ['GENOS_AGENT_GIT_REPLAY_PROBES', 'GENOS_AGENT_GIT_MERGE_PROBES',
    'GENOS_AGENT_GIT_MERGE_FIXTURES', 'GENOS_AGENT_GIT_REQUIRE_MERGE_PROBES'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.GENOS_AGENT_GIT_REPLAY_PROBES = JSON.stringify({ budget:
      path.join(__dirname, 'fixtures', 'agentGitBudgetReplay.cjs') });
    process.env.GENOS_AGENT_GIT_MERGE_PROBES = JSON.stringify(['budget']);
    process.env.GENOS_AGENT_GIT_MERGE_FIXTURES = JSON.stringify({ budget: { maxConsumed: 3 } });
    process.env.GENOS_AGENT_GIT_REQUIRE_MERGE_PROBES = 'true';
    const state = { runs: [{ budget_json: '{"consumed":2}' }], capturedAt: 'fixed' };
    const accepted = await verifyFunctionalMerge(state);
    assert.equal(accepted.verified, true);
    assert.equal(accepted.probes[0].evidenceHash.length, 64);
    const refused = await verifyFunctionalMerge({ ...state, runs: [{ budget_json: '{"consumed":4}' }] });
    assert.equal(refused.verified, false);
    delete process.env.GENOS_AGENT_GIT_MERGE_PROBES;
    assert.equal((await verifyFunctionalMerge(state)).verified, false);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
  console.log('AgentGit functional merge probe gate passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
