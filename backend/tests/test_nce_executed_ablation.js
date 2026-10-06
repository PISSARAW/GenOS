'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { fixture } = require('./nce_native_fixture');
const { runAblationCampaign } = require('../src/services/nceAblationService');
const { program } = require('../src/services/nceProcedureProgram');

async function main() {
  const ctx = await fixture();
  try {
    const input = { ...ctx, campaignId: 'ablation-native-1', seeds: [41, 83],
      family: 'absolute-ascending', count: 1, timeoutMs: 90000,
      artifacts: [{ id: 'absolute-sort', agentId: 'teacher', provenance: { createdBy: 'teacher' },
        content: { procedure: program(['absolute', 'sort']) } }],
      arms: ['baseline', 'withoutPlay', 'withoutCulture', 'withoutPhenotype', 'withoutPoet', 'full'] };
    const report = await runAblationCampaign(input);
    assert.equal(report.evidenceClass, 'executed-task-benchmark');
    assert.equal(report.outcomes.length, 12);
    assert.equal(report.measuredPairs, 2);
    assert.equal(report.meanDelta, 1);
    assert.equal(report.standardError, 0);
    for (const { arm, receipt } of report.outcomes) {
      assert.equal(receipt.measured, true, JSON.stringify(receipt));
      assert.equal(receipt.promoted, ['full', 'withoutPlay', 'withoutPoet'].includes(arm));
      assert.ok(receipt.before.evidenceRef && receipt.after.evidenceRef);
    }
    await assert.rejects(runAblationCampaign({ ...input, seeds: [1, 1] }), /unique/);
    console.log(JSON.stringify({ benchmark: report.schema, meanDelta: report.meanDelta,
      measuredPairs: report.measuredPairs, standardError: report.standardError,
      arms: report.outcomes.map(({ arm, seed, receipt }) => ({ arm, seed, delta: receipt.delta,
        durationMs: receipt.durationMs, evidenceRef: receipt.evidenceRef })) }));
  } finally {
    await ctx.db.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
