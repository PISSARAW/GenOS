'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hash } = require('./contract.cjs');
const ROOT = path.resolve(__dirname, '../..');
const FILES = ['contract.cjs', 'analysis.cjs', 'environment.cjs', 'evidence.cjs',
  'worker.cjs', 'sources.cjs', 'archive.cjs', 'run.cjs', 'verify.cjs']
  .map((file) => `benchmarks/agow-paired-native/${file}`)
  .concat(['backend/src/services/agow/missionObservationService.js',
    'backend/src/services/agow/missionObservationContract.js',
    'backend/src/services/agow/missionObservationRuntimeBridge.js',
    'backend/src/services/agow/nativeMissionOutcomeVerifier.js',
    'backend/src/services/agow/nativeRefutedOutcomeVerifier.js',
    'backend/src/services/agow/nativeRefutationReceipts.js',
    'backend/src/services/agents/deterministicWorkerRuntime.js',
    'backend/src/services/agents/subOrchestratorDispatchService.js',
    'backend/src/services/agentRuntimeAdapter/missionPlanning.js',
    'backend/src/services/strategyExecutionService.js',
    'backend/src/services/missionProtocols/runtime.js',
    'backend/src/services/missionProtocols/nativeEventRecording.js',
    'backend/src/services/epistemic/nativeOracleProof.js',
    'backend/src/services/epistemic/nativeOracleCoordinator.js',
    'backend/src/services/epistemic/nativeOracleExecutionJournal.js',
    'backend/src/services/epistemic/nativeOracleJournal.js',
    'backend/src/services/epistemic/oracleProcedureSubject.js',
    'backend/src/services/epistemic/oracleSubsetChecks.js',
    'backend/src/services/epistemic/verifierRuntimeBridge.js',
    'backend/src/services/missionEnvelopeAuthority.js',
    'backend/src/services/biologicalWorkerStore.js',
    'backend/tests/test_bounded_worker_delegation.js',
    'backend/tests/test_agow_paired_campaign.js',
    'backend/tests/test_agow_paired_native_runtime.js']);

async function capture() {
  const result = {};
  for (const file of FILES) result[file] = hash(await fs.readFile(path.join(ROOT, file)));
  return result;
}

async function check(expected) {
  assert.deepEqual(await capture(), expected, 'Pinned campaign or runtime source changed');
}

module.exports = { ROOT, capture, check };
