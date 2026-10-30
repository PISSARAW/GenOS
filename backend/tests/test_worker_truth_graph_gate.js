'use strict';

const assert = require('node:assert/strict');
const barrier = require('../src/services/workerEvidenceBarrier');

async function rejectsMissingGraph() {
  const context = { db: {}, agentId: 'gate-test', autonomyPlan: {} };
  await assert.rejects(barrier.enforceReportGate(context), { code: 'MISSION_REPORT_GATE_UNAVAILABLE' });
}

async function rejectsUnavailableMeasurement() {
  const compilerPath = require.resolve('../src/services/reportCompilerService');
  const original = require.cache[compilerPath];
  require.cache[compilerPath] = { id: compilerPath, filename: compilerPath,
    loaded: true, exports: { buildTruthGraph: async () => ({ status: 'unavailable' }) } };
  try {
    await assert.rejects(barrier.attachTruthGraph({ db: {}, agentId: 'gate-test', autonomyPlan: {} }),
      { code: 'MISSION_TRUTH_GRAPH_UNAVAILABLE' });
  } finally {
    if (original) require.cache[compilerPath] = original;
    else delete require.cache[compilerPath];
  }
}

async function rejectsUnsupportedClaim() {
  const context = { agentId: 'gate-test', autonomyPlan: { missionTruthGraph: {
    claims: [{ id: 'claim-1', outcome: 'success', confidence: 'unknown' }]
  } } };
  await assert.rejects(barrier.enforceReportGate(context), (error) => {
    assert.equal(error.code, 'MISSION_REPORT_GATE_REJECTED');
    assert.deepEqual(error.claimIds, ['claim-1']);
    return true;
  });
}

async function main() {
  await rejectsMissingGraph();
  await rejectsUnavailableMeasurement();
  await rejectsUnsupportedClaim();
  console.log('Worker truth graph gate fails closed: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
