'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { runProbe, configuredProbe } = require('../src/services/agentGitService/replayProbeRunner.cjs');

async function main() {
  process.env.GENOS_AGENT_GIT_REPLAY_PROBES = JSON.stringify({ budget: path.join(__dirname, 'fixtures', 'agentGitBudgetReplay.cjs') });
  assert.throws(() => configuredProbe('unregistered'), /server-registered/);
  const input = { name: 'budget', state: { runs: [{ budget_json: '{"consumed":3}' }] },
    fixtures: { maxConsumed: 4 }, seed: 'fixed', now: '2026-01-01T00:00:00Z' };
  const good = await runProbe(input);
  const bad = await runProbe({ ...input, fixtures: { maxConsumed: 2 } });
  assert.equal(good.pass, true);
  assert.equal(bad.pass, false);
  assert.notEqual(good.evidence.pid, process.pid);
  assert.equal(good.evidence.seed, 'fixed');
  assert.notEqual(good.evidenceHash, bad.evidenceHash);
  console.log('AgentGit executable replay probe passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
