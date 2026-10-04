'use strict';

const assert = require('node:assert/strict');
const { CASES, runCampaign, summary } = require('../../benchmarks/workers/campaign.cjs');
const { compare } = require('../../benchmarks/workers/compare.cjs');
const adapter = require('../../benchmarks/workers/genos-adapter.cjs');

async function run() {
  assert.equal(CASES.length, 20);
  assert.equal(new Set(CASES.map((item) => item.workerKind)).size, 19);
  const report = await runCampaign(adapter, 'genos');
  assert.deepEqual(summary(report), { passed: 4, failed: 0, unverified: 0, unmeasured: 16, total: 20, kinds: 19 });
  await assert.rejects(compare(report, report), /distinct identified systems/);
  const rival = structuredClone(report);
  rival.systemId = 'rival';
  rival.results.find((row) => row.id === 'lpt-schedule').execution.result.output.makespan = 8;
  await assert.rejects(compare(report, rival), /inconsistent/);
  rival.results.find((row) => row.id === 'lpt-schedule').score = 'failed';
  assert.equal((await compare(report, rival)).comparableCases, 4);
  rival.results.pop();
  await assert.rejects(compare(report, rival), /missing or duplicate/);
  const fake = { runCase: async () => ({ status: 'executed', result: { output: { makespan: 7 } },
    receipt: { id: `solver://sha256:${'0'.repeat(64)}` } }) };
  const fakeReport = await runCampaign(fake, 'fake', [CASES.find((item) => item.id === 'lpt-schedule')]);
  assert.equal(fakeReport.results[0].score, 'failed');
}

run().then(() => console.log('Worker parity campaign: PASS')).catch((error) => { console.error(error); process.exitCode = 1; });
