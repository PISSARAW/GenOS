'use strict';

function definition(domain = 'subset_sum') {
  if (domain === 'scan_literal') return { subject: require('./oracleScoutSubject'),
    claim: require('./oracleScoutClaim'), checks: require('./oracleScoutChecks'), verifierType: 'native_method_semantic' };
  if (domain === 'monitor_samples') return { subject: require('./oracleMonitorSubject'),
    claim: require('./oracleMonitorClaim'), checks: require('./oracleMonitorChecks'), verifierType: 'native_method_semantic' };
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

async function load(db, request) {
  const binding = await require('../biologicalWorkerStore').binding(db, request.runId);
  const method = binding?.genome.workerContract?.mission?.methodContract;
  if (method?.methodId === 'verify_code_postconditions') return require('./oracleCodeSubject').load(db, request);
  if (method?.methodId === 'verify_memory_fidelity') return require('./oracleMemoryRuntimeSubject').load(db, request);
  if (method?.methodId === 'scan_literal') return require('./oracleScoutSubject').load(db, request);
  if (method?.methodId === 'monitor_samples') return require('./oracleMonitorSubject').load(db, request);
  if (method?.methodId === 'replenish_external_quota') {
    const subject = await require('./oracleExternalCreditSubject').load(db, request);
    return { ...subject, domain: 'external_credit', runId: request.runId, workerId: request.agentId };
  }
  const procedure = method?.parameters?.procedure;
  const subsetProcedure = method?.methodId === 'subset_sum'
    || (['scoped_procedure', 'host_procedure', 'niche_procedure'].includes(method?.methodId)
      && procedure?.version === 1 && procedure.methodId === 'subset_sum');
  if (subsetProcedure) {
    const subject = await require('./oracleProcedureSubject').load(db, request);
    return { ...subject, domain: 'subset_sum', runId: request.runId, workerId: request.agentId };
  }
  const subject = await require('./oracleWorkerArtifactSubject').load(db, request);
  return { ...subject, domain: 'worker_artifact', runId: request.runId, workerId: request.agentId };
}

function executionOptions(subject, request) {
  if (subject.domain === 'scan_literal') return { nativeScoutSubject: request };
  if (subject.domain === 'monitor_samples') return { nativeMonitorSubject: request };
  if (subject.domain === 'external_credit') return { nativeOracleSubject: request };
  if (subject.domain === 'worker_artifact') return { nativeOracleSubject: request };
  if (subject.domain === 'memory_fidelity') return { nativeMemoryRuntimeSubject: request };
  if (subject.domain === 'code_postconditions') return { nativeCodeSubject: request };
  return { nativeOracleSubject: request };
}

module.exports = { definition, load, executionOptions };
