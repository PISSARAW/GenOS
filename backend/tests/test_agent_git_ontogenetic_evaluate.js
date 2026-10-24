'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { validateInput, runPairedProbes, summarize } = require('../src/services/agentGitService/ontogeneticEvaluate.cjs');

async function main() {
  process.env.GENOS_AGENT_GIT_REPLAY_PROBES = JSON.stringify({ budget:
    path.join(__dirname, 'fixtures', 'agentGitBudgetReplay.cjs') });
  const config = validateInput({ baselineObjectId: 'a', candidateObjectId: 'b',
    probeNames: ['budget'], fixtures: { budget: { maxConsumed: 4 } }, seed: 'shared' });
  assert.throws(() => validateInput({ baselineObjectId: 'a', candidateObjectId: 'b',
    probeNames: ['budget', 'budget'] }), /distinct/);
  const states = { baseline: { agent: { name: 'A', role: 'worker' }, plasmids: [{ plasmid_id: 'skill' }],
    runs: [{ status: 'completed', budget_json: '{"consumed":6}' }] },
  candidate: { agent: { name: 'Fork of A', role: 'worker' }, plasmids: [{ plasmid_id: 'skill' }],
    runs: [{ status: 'completed', budget_json: '{"consumed":3}' }] } };
  const probes = await runPairedProbes(states, config);
  assert.equal(probes[0].baseline.pass, false);
  assert.equal(probes[0].candidate.pass, true);
  assert.equal(probes[0].baseline.evidence.seed, 'shared');
  assert.equal(probes[0].candidate.evidence.seed, 'shared');
  const result = summarize(states, probes);
  assert.equal(result.identity.stable, true);
  assert.equal(result.taskPerformance.candidatePassed, 1);
  assert.equal(result.execution.baseline.budgetConsumed, 6);
  assert.equal(result.execution.candidate.budgetConsumed, 3);
  assert.equal(result.selection, 'not_performed');
  console.log('AgentGit ontogenetic paired evaluation passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
