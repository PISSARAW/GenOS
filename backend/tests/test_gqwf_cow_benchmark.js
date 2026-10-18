'use strict';

const assert = require('node:assert/strict');
const { options, runProtocol } = require('../../benchmarks/gqwf-overlays/compare.cjs');

async function main() {
  assert.throws(() => options(['--repetitions=2']), /AssertionError/);
  assert.throws(() => options(['--views=1001']), /AssertionError/);
  const config = { views: 3, files: 2, bytes: 32, repetitions: 3 };
  const report = await runProtocol(config);
  assert.equal(report.protocol, 'gqwf-cow-paired-v1');
  assert.equal(report.qualification.semanticParity, true);
  assert.equal(report.qualification.minimumRepetitionsMet, true);
  assert.equal(report.qualification.performanceClaim, 'none');
  assert.deepEqual(report.pairs.map((pair) => pair.order), [
    ['physical', 'gqwf'], ['gqwf', 'physical'], ['physical', 'gqwf']
  ]);
  for (const pair of report.pairs) {
    assert.deepEqual(pair.physical.content, { files: 9, bytes: 261 });
    assert.deepEqual(pair.gqwf.content, { files: 3, bytes: 87 });
    assert.equal(pair.physical.content.bytes / pair.gqwf.content.bytes, 3);
    assert.equal(pair.gqwf.createViews.count, 3);
    assert.equal(pair.gqwf.overlay.count, 3);
  }
  assert.equal(report.summary.physicalToGqwfContentRatio.median, 3);
  console.log('GQWF paired Copy-on-Write qualification: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
