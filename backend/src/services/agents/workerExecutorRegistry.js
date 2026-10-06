'use strict';

const { error } = require('./workerNativeEvidence');

const EXECUTORS = Object.freeze({
  scout_cell: ['scan_literal', 'deterministicWorkerScout', 'assertScoutInput', 'runScout'],
  resident_daemon: ['monitor_samples', 'deterministicWorkerMonitor', 'assertMonitorInput', 'runMonitor'],
  bounded_worker: ['scoped_procedure', 'workerScopedProcedures', 'assertScopedInput', 'runScoped'],
  adaptive_worker: ['adapt_procedure', 'workerScopedProcedures', 'assertAdaptiveInput', 'runAdaptive'],
  specialist: ['niche_procedure', 'workerScopedProcedures', 'assertNicheInput', 'runNiche'],
  procedural_executor: [['lpt', 'subset_sum'], 'deterministicWorkerProcedures', null, 'runProcedure'],
  symbiotic_worker: ['host_procedure', 'workerScopedProcedures', 'assertHostInput', 'runHost'],
  verifier_worker: ['verify_procedure', 'deterministicWorkerVerifier', 'assertVerificationInput', 'runVerification'],
  red_worker: ['falsify_procedure', 'deterministicWorkerRed', 'assertRedInput', 'runRed'],
  experimental_worker: ['measure_lpt', 'deterministicWorkerExperiment', 'assertExperimentInput', 'runExperiment'],
  formal_worker: [['formal_proof', 'theorem_proving'], 'deterministicWorkerFormal', null, 'runFormal'],
  synthesis_worker: ['synthesize_claims', 'deterministicWorkerSynthesis', 'assertSynthesisInput', 'runSynthesis'],
  creative_worker: ['combine_candidates', 'workerCandidateExecutor', 'assertCandidateInput', 'runCandidates'],
  medical_worker: ['review_synthetic_case', 'workerCandidateExecutor', 'assertClinicalInput', 'runClinical'],
  recovery_worker: ['restore_checkpoint', 'workerRecoveryExecutor', 'assertRecoveryInput', 'runRecovery'],
  forensic_worker: ['trace_declared_causes', 'deterministicWorkerForensic', 'assertForensicInput', 'runForensic'],
  liaison_worker: ['prepare_handoff', 'workerCoordinationExecutor', 'assertHandoffInput', 'runHandoff'],
  teaching_worker: ['teach_subset_sum', 'deterministicWorkerTeaching', 'assertTeachingInput', 'runTeaching'],
  sub_orchestrator: ['coordinate_children', 'workerCoordinationExecutor', 'assertCoordinationInput', 'runCoordination']
});

const ARITHMETIC = ['check_arithmetic', 'workerArithmeticExecutor', 'assertArithmeticInput', 'runArithmetic'];
const ALWAYS_NATIVE = new Set(['procedural_executor', 'formal_worker']);

function descriptor(kind, methodId) {
  if (kind === 'formal_worker' && methodId === 'check_arithmetic') return ARITHMETIC;
  const selected = Object.hasOwn(EXECUTORS, kind) ? EXECUTORS[kind] : null;
  if (!selected) return null;
  const methods = Array.isArray(selected[0]) ? selected[0] : [selected[0]];
  return methods.includes(methodId) ? selected : null;
}

function hasNativeMethod(kind, methodId) {
  return Boolean(descriptor(kind, methodId));
}

function assertNativeInput(kind, method) {
  const selected = descriptor(kind, method?.methodId);
  if (!selected || method?.version !== 1) throw error('WORKER_EXECUTOR_UNAVAILABLE', `No native '${kind}' executor for '${method?.methodId || 'unspecified'}'.`);
  const module = require(`./${selected[1]}`);
  if (selected[2]) return module[selected[2]](method);
  if (kind === 'formal_worker') return module.sourceFor(method.parameters);
  if (!method.parameters || typeof method.parameters !== 'object' || Array.isArray(method.parameters)) {
    throw error('WORKER_PROCEDURE_INPUT_INVALID', 'Structured procedure parameters are required.');
  }
  return true;
}

async function executeNativeWorker(kind, method, context) {
  assertNativeInput(kind, method);
  const selected = descriptor(kind, method.methodId);
  const module = require(`./${selected[1]}`);
  if (selected[3] === 'runFormal') {
    const remaining = Math.max(1, context.deadline - Date.now());
    return module.runFormal(method, { timeoutMs: Math.min(30000, remaining) });
  }
  return module[selected[3]](method, context);
}

function executorCatalog() {
  return Object.entries(EXECUTORS).map(([kind, selected]) => ({ kind,
    methods: [...(Array.isArray(selected[0]) ? selected[0] : [selected[0]]),
      ...(kind === 'formal_worker' ? ['check_arithmetic'] : [])] }));
}

module.exports = { ALWAYS_NATIVE, hasNativeMethod, assertNativeInput, executeNativeWorker, executorCatalog };
