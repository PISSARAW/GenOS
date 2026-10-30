'use strict';

function definition(domain = 'subset_sum') {
  if (domain === 'workspace_claims') return { subject: require('./oracleWorkspaceSubject'),
    claim: require('./oracleWorkspaceClaim'), checks: require('./oracleWorkspaceChecks'), verifierType: 'workspace_semantic' };
  if (domain === 'model_subset_sum') return { subject: require('./oracleModelSubject'),
    claim: require('./oracleModelClaim'), checks: require('./oracleModelChecks'), verifierType: 'model_semantic' };
  const observations = require('./oracleObservationSubject').SPECS;
  if (Object.hasOwn(observations, domain)) return { subject: require('./oracleObservationSubject').forDomain(domain),
    claim: require('./oracleObservationClaim'), checks: require('./oracleObservationChecks').forDomain(domain),
    verifierType: 'observation_semantic' };
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
  if (binding?.genome.workerContract?.assignment?.workspaceVerificationContract) {
    return require('./oracleWorkspaceSubject').load(db, request);
  }
  if (method?.methodId === 'model_subset_sum') return require('./oracleModelSubject').load(db, request);
  if (method?.methodId === 'replenish_external_quota') {
    const subject = await require('./oracleExternalCreditSubject').load(db, request);
    return { ...subject, domain: 'external_credit', runId: request.runId, workerId: request.agentId };
  }
  if (method?.methodId === 'verify_worker_artifact'
      || binding?.genome.workerContract?.mission?.workerArtifactContract) {
    const subject = await require('./oracleWorkerArtifactSubject').load(db, request);
    return { ...subject, domain: 'worker_artifact', runId: request.runId, workerId: request.agentId };
  }
  if (['scan_literal', 'monitor_samples', 'synthesize_claims', 'trace_declared_causes', 'measure_lpt',
    'verify_procedure', 'falsify_procedure', 'teach_subset_sum', 'formal_proof',
    'restore_checkpoint', 'prepare_handoff', 'coordinate_children', 'adapt_procedure', 'niche_procedure',
    'host_procedure', 'combine_candidates', 'review_synthetic_case'].includes(method?.methodId)) {
    return require('./oracleObservationSubject').load(db, request);
  }
  if (method?.methodId === 'verify_code_postconditions'
      || binding?.genome.workerContract?.mission?.codeVerificationContract) {
    return require('./oracleCodeSubject').load(db, request);
  }
  if (method?.methodId === 'verify_memory_fidelity') return require('./oracleMemoryRuntimeSubject').load(db, request);
  const subject = await require('./oracleProcedureSubject').load(db, request);
  return { ...subject, domain: 'subset_sum', runId: request.runId, workerId: request.agentId };
}

function executionOptions(subject, request) {
  if (subject.domain === 'workspace_claims') return { nativeWorkspaceSubject: request };
  if (subject.domain === 'model_subset_sum') return { nativeModelSubject: request };
  if (['literal_observation', 'monitor_window', 'claim_synthesis', 'declared_causality', 'lpt_experiment',
    'procedure_verification', 'procedure_falsification', 'subset_sum_teaching', 'formal_theorem',
    'checkpoint_recovery', 'sourced_handoff', 'child_coordination', 'adaptive_strategy', 'niche_procedure',
    'host_procedure', 'creative_combination', 'synthetic_case_review'].includes(subject.domain)) {
    return { nativeObservationSubject: request };
  }
  if (subject.domain === 'memory_fidelity') return { nativeMemoryRuntimeSubject: request };
  if (subject.domain === 'code_postconditions') return { nativeCodeSubject: request };
  return { nativeOracleSubject: request };
}

module.exports = { definition, load, executionOptions };
