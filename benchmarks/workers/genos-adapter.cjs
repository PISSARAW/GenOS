'use strict';

const { runProcedure } = require('../../backend/src/services/agents/deterministicWorkerProcedures');
const { runFormal } = require('../../backend/src/services/agents/deterministicWorkerFormal');
const { runVerification } = require('../../backend/src/services/agents/deterministicWorkerVerifier');

async function runCase(testCase) {
  if (testCase.workerKind === 'procedural_executor') {
    const result = runProcedure(testCase.methodContract);
    return { status: 'executed', result, receipt: result.receipt };
  }
  if (testCase.workerKind === 'verifier_worker') {
    const result = runVerification(testCase.methodContract);
    return { status: 'executed', result, receipt: result.expectedReceipt };
  }
  if (testCase.workerKind === 'formal_worker') {
    const toolchainVersion = process.env.GENOS_BENCHMARK_LEAN_VERSION;
    if (!toolchainVersion) return { status: 'unavailable', reason: 'GENOS_BENCHMARK_LEAN_VERSION is required.' };
    const method = { ...testCase.methodContract, parameters: {
      ...testCase.methodContract.parameters, toolchainVersion
    } };
    const result = await runFormal(method);
    return { status: 'executed', result, receipt: result.solverReceipt };
  }
  return { status: 'unavailable', reason: 'No real benchmark adapter is connected for this worker kind.' };
}

module.exports = { runCase };
