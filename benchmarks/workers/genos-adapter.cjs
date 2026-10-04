'use strict';

const { runProcedure } = require('../../backend/src/services/agents/deterministicWorkerProcedures');
const { runFormal } = require('../../backend/src/services/agents/deterministicWorkerFormal');
const { runVerification } = require('../../backend/src/services/agents/deterministicWorkerVerifier');
const { runRed } = require('../../backend/src/services/agents/deterministicWorkerRed');
const { runExperiment } = require('../../backend/src/services/agents/deterministicWorkerExperiment');
const { runSynthesis } = require('../../backend/src/services/agents/deterministicWorkerSynthesis');
const { runMonitor } = require('../../backend/src/services/agents/deterministicWorkerMonitor');
const { runForensic } = require('../../backend/src/services/agents/deterministicWorkerForensic');
const { runScout } = require('../../backend/src/services/agents/deterministicWorkerScout');
const { runTeaching } = require('../../backend/src/services/agents/deterministicWorkerTeaching');

const RUNNERS = Object.freeze({
  scout_cell: [runScout, 'scoutReceipt'],
  procedural_executor: [runProcedure, 'receipt'],
  verifier_worker: [runVerification, 'expectedReceipt'],
  red_worker: [runRed, 'expectedReceipt'],
  experimental_worker: [runExperiment, 'procedureReceipt'],
  synthesis_worker: [runSynthesis, 'synthesisReceipt'],
  resident_daemon: [runMonitor, 'monitorReceipt'],
  forensic_worker: [runForensic, 'forensicReceipt'],
  teaching_worker: [runTeaching, 'teachingReceipt']
});

async function runCase(testCase) {
  const runner = RUNNERS[testCase.workerKind];
  if (runner) {
    const result = runner[0](testCase.methodContract);
    return { status: 'executed', result, receipt: result[runner[1]] };
  }
  if (testCase.workerKind === 'formal_worker') {
    const toolchainVersion = process.env.GENOS_BENCHMARK_LEAN_VERSION;
    if (!toolchainVersion) return { status: 'unavailable', reason: 'GENOS_BENCHMARK_LEAN_VERSION is required.' };
    const method = { ...testCase.methodContract, parameters: {
      ...testCase.methodContract.parameters, toolchainVersion
    } };
    const result = await runFormal(method, { timeoutMs: 120000 });
    return { status: 'executed', result, receipt: result.solverReceipt };
  }
  return { status: 'unavailable', reason: 'No real benchmark adapter is connected for this worker kind.' };
}

module.exports = { runCase };
