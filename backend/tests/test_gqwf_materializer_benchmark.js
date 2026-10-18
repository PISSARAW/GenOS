'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const portable = require('../src/services/gqwf/materialization/portableCopy');
const { CONTRACT_VERSION } = require('../src/services/gqwf/materialization/contract');
const { options, runProtocol } = require('../../benchmarks/gqwf-materializers/compare.cjs');

function capabilities(id, available, reason = null) {
  return { backendId: id, available, unavailableReason: reason,
    platform: process.platform, materialization: 'eager', copyGranularity: 'file',
    requiresMount: false, portable: false, supportsCapture: true, supportsRecovery: true };
}

function alias(id, behavior = {}) {
  return {
    id,
    contractVersion: CONTRACT_VERSION,
    probe: async () => capabilities(id, behavior.available !== false,
      behavior.available === false ? 'fixture_unavailable' : null),
    materialize: async (input) => {
      const result = await portable.materialize(input);
      if (behavior.drift) await fs.writeFile(path.join(input.destination, 'drift.txt'), 'drift');
      return result;
    },
    capture: portable.capture,
    release: portable.release,
    recover: portable.recover
  };
}

async function main() {
  assert.throws(() => options(['--repetitions=2']), /AssertionError/);
  assert.throws(() => options(['--backends=bad_backend']), /AssertionError/);
  const equivalent = alias('fixture-equivalent-v1');
  const drifted = alias('fixture-drifted-v1', { drift: true });
  const unavailable = alias('fixture-unavailable-v1', { available: false });
  const config = { files: 1, bytes: 16, repetitions: 3,
    backends: [equivalent.id, drifted.id, unavailable.id] };
  const report = await runProtocol(config,
    { materializers: [portable, equivalent, drifted, unavailable] });

  assert.equal(report.protocol, 'gqwf-materializer-paired-v1');
  assert.equal(report.qualification.status, 'failed');
  assert.equal(report.qualification.semanticParity, false);
  assert.equal(report.qualification.performanceClaim, 'none');
  assert.equal(report.qualification.runtimePromotionAuthorized, false);
  assert.equal(report.qualification.autoPolicyChanged, false);
  assert.deepEqual(report.skipped,
    [{ backendId: unavailable.id, reason: 'fixture_unavailable' }]);
  assert.equal(report.pairs.length, 6);

  const equivalentSummary = report.summary.find((item) => item.backendId === equivalent.id);
  const driftedSummary = report.summary.find((item) => item.backendId === drifted.id);
  assert.equal(equivalentSummary.status, 'qualified');
  assert.equal(equivalentSummary.semanticParity, true);
  assert.equal(driftedSummary.status, 'semantic_mismatch');
  assert.equal(driftedSummary.semanticParity, false);
  assert.deepEqual(report.pairs.filter((pair) => pair.candidateBackend === equivalent.id)
    .map((pair) => pair.order), [
    [equivalent.id, 'portable-copy-v1'],
    ['portable-copy-v1', equivalent.id],
    [equivalent.id, 'portable-copy-v1']
  ]);
  console.log('GQWF paired materializer qualification: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
