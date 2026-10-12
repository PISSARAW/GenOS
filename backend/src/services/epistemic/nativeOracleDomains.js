'use strict';

function definition(domain = 'subset_sum') {
  if (domain === 'model_subset_sum') return { subject: require('./oracleModelSubject'),
    claim: require('./oracleModelClaim'), checks: require('./oracleModelChecks'), verifierType: 'model_semantic' };
  if (domain === 'scan_literal') return { subject: require('./oracleScoutSubject'),
    claim: require('./oracleScoutClaim'), checks: require('./oracleScoutChecks'), verifierType: 'native_method_semantic' };
  if (domain === 'monitor_samples') return { subject: require('./oracleMonitorSubject'),
    claim: require('./oracleMonitorClaim'), checks: require('./oracleMonitorChecks'), verifierType: 'native_method_semantic' };
  if (domain === 'worker_native') return { subject: require('./oracleWorkerSubject'),
    claim: require('./oracleWorkerClaim'), checks: require('./oracleWorkerChecks'), verifierType: 'worker_semantic' };
  if (domain === 'code_postconditions') return { subject: require('./oracleCodeSubject'),
    claim: require('./oracleCodeClaim'), checks: require('./oracleCodeChecks'), verifierType: 'code_semantic' };
  if (domain === 'memory_fidelity') return { subject: require('./oracleMemorySubject'),
    claim: require('./oracleMemoryClaim'), checks: require('./oracleMemoryChecks'), verifierType: 'memory_semantic' };
  if (domain === 'subset_sum') return { subject: require('./oracleProcedureSubject'),
    claim: require('./oracleProcedureClaim'), checks: require('./oracleSubsetChecks'), verifierType: 'procedure_semantic' };
  if (domain === 'external_credit') return { subject: require('./oracleExternalCreditSubject'),
    claim: require('./oracleExternalCreditClaim'), checks: require('./oracleExternalCreditChecks.cjs'), verifierType: 'external_credit_semantic' };
  if (domain === 'worker_artifact') return { subject: require('./oracleWorkerArtifactSubject'),
    claim: require('./oracleWorkerArtifactClaim'), checks: require('./oracleWorkerArtifactChecks.cjs'), verifierType: 'worker_artifact_semantic' };
  throw require('../trinityProvenanceValues').failure('ORACLE_DOMAIN_UNAVAILABLE');
}

const METHOD_SUBJECTS = {
  model_subset_sum: ['./oracleModelSubject', null],
  verify_code_postconditions: ['./oracleCodeSubject', null],
  verify_memory_fidelity: ['./oracleMemoryRuntimeSubject', null],
  scan_literal: ['./oracleScoutSubject', null],
  monitor_samples: ['./oracleMonitorSubject', null],
  replenish_external_quota: ['./oracleExternalCreditSubject', 'external_credit']
};

async function load(db, request) {
  const binding = await require('../biologicalWorkerStore').binding(db, request.runId);
  const method = binding?.genome.workerContract?.mission?.methodContract;
  const direct = await loadMethodSubject(db, request, method);
  if (direct) return direct;
  if (isSubsetProcedure(method)) return loadSubsetProcedure(db, request);
  if (require('./oracleWorkerSubject').METHODS.has(method?.methodId)) {
    return require('./oracleWorkerSubject').load(db, request);
  }
  return loadWorkerArtifact(db, request);
}

async function loadMethodSubject(db, request, method) {
  const selected = METHOD_SUBJECTS[method?.methodId];
  if (!selected) return null;
  const subject = await require(selected[0]).load(db, request);
  return selected[1] ? { ...subject, domain: selected[1], runId: request.runId, workerId: request.agentId } : subject;
}

function isSubsetProcedure(method) {
  const procedure = method?.parameters?.procedure;
  return method?.methodId === 'subset_sum'
    || (['scoped_procedure', 'host_procedure', 'niche_procedure'].includes(method?.methodId)
      && procedure?.version === 1 && procedure.methodId === 'subset_sum');
}

async function loadSubsetProcedure(db, request) {
  const subject = await require('./oracleProcedureSubject').load(db, request);
  return { ...subject, domain: 'subset_sum', runId: request.runId, workerId: request.agentId };
}

async function loadWorkerArtifact(db, request) {
  const subject = await require('./oracleWorkerArtifactSubject').load(db, request);
  return { ...subject, domain: 'worker_artifact', runId: request.runId, workerId: request.agentId };
}

function executionOptions(subject, request) {
  if (subject.domain === 'model_subset_sum') return { nativeModelSubject: request };
  if (subject.domain === 'scan_literal') return { nativeScoutSubject: request };
  if (subject.domain === 'monitor_samples') return { nativeMonitorSubject: request };
  if (subject.domain === 'worker_native') return { nativeWorkerSubject: request };
  if (subject.domain === 'external_credit') return { nativeOracleSubject: request };
  if (subject.domain === 'worker_artifact') return { nativeOracleSubject: request };
  if (subject.domain === 'memory_fidelity') return { nativeMemoryRuntimeSubject: request };
  if (subject.domain === 'code_postconditions') return { nativeCodeSubject: request };
  return { nativeOracleSubject: request };
}

module.exports = { definition, load, executionOptions };
