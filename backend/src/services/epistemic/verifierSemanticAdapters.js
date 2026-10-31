'use strict';

module.exports = {
  workspace_semantic: () => require('./oracleWorkspaceAdapter').runWorkspaceOracle,
  code_semantic: () => require('./oracleCodeAdapter').runCodeOracle,
  procedure_semantic: () => require('./oracleProcedureAdapter').runProcedureOracle,
  observation_semantic: () => require('./oracleObservationAdapter').runObservationOracle,
  memory_semantic: () => require('./oracleMemoryAdapter').runMemoryOracle,
  external_credit_semantic: () => require('./oracleExternalCreditAdapter').runExternalCreditOracle,
  worker_artifact_semantic: () => require('./oracleWorkerArtifactAdapter').runWorkerArtifactOracle
};
