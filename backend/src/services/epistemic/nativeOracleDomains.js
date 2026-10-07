'use strict';

function definition(domain = 'subset_sum') {
  if (domain === 'code_postconditions') return { subject: require('./oracleCodeSubject'),
    claim: require('./oracleCodeClaim'), checks: require('./oracleCodeChecks'), verifierType: 'code_semantic' };
  if (domain === 'memory_fidelity') return { subject: require('./oracleMemorySubject'),
    claim: require('./oracleMemoryClaim'), checks: require('./oracleMemoryChecks'), verifierType: 'memory_semantic' };
  if (domain === 'subset_sum') return { subject: require('./oracleProcedureSubject'),
    claim: require('./oracleProcedureClaim'), checks: require('./oracleSubsetChecks'), verifierType: 'procedure_semantic' };
  throw require('../trinityProvenanceValues').failure('ORACLE_DOMAIN_UNAVAILABLE');
}

async function load(db, request) {
  const binding = await require('../biologicalWorkerStore').binding(db, request.runId);
  const method = binding?.genome.workerContract?.mission?.methodContract;
  if (method?.methodId === 'verify_code_postconditions') return require('./oracleCodeSubject').load(db, request);
  if (method?.methodId === 'verify_memory_fidelity') return require('./oracleMemoryRuntimeSubject').load(db, request);
  const subject = await require('./oracleProcedureSubject').load(db, request);
  return { ...subject, domain: 'subset_sum', runId: request.runId, workerId: request.agentId };
}

function executionOptions(subject, request) {
  if (subject.domain === 'memory_fidelity') return { nativeMemoryRuntimeSubject: request };
  if (subject.domain === 'code_postconditions') return { nativeCodeSubject: request };
  return { nativeOracleSubject: request };
}

module.exports = { definition, load, executionOptions };
