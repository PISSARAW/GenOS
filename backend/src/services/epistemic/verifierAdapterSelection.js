'use strict';

const SPECIALIZED = {
  workspace_semantic: () => require('./oracleWorkspaceAdapter').runWorkspaceOracle,
  code_semantic: () => require('./oracleCodeAdapter').runCodeOracle,
  procedure_semantic: () => require('./oracleProcedureAdapter').runProcedureOracle,
  external_credit_semantic: () => require('./oracleExternalCreditAdapter').runExternalCreditOracle,
  worker_artifact_semantic: () => require('./oracleWorkerArtifactAdapter').runWorkerArtifactOracle,
  memory_semantic: () => require('./oracleMemoryAdapter').runMemoryOracle
};
const ALIASES = { testResult: 'test', replay: 'test', counterexample: 'behavior', source: 'behavior',
  proof: 'artifact', repro: 'artifact' };

function selectAdapter(verifier, adapters) {
  const specialized = SPECIALIZED[verifier.type];
  if (specialized) return specialized();
  if (verifier.type === 'native_method_semantic') return nativeMethodAdapter(verifier);
  if (verifier.artifact) return adapters.artifact;
  if (verifier.test) return adapters.test;
  if (adapters[verifier.type]) return adapters[verifier.type];
  return adapters[ALIASES[verifier.type]] || null;
}

function nativeMethodAdapter(verifier) {
  const strategy = verifier.strategy?.[0] || '';
  const module = strategy.startsWith('monitor_') ? './oracleMonitorAdapter' : './oracleScoutAdapter';
  return require(module)[strategy.startsWith('monitor_') ? 'runMonitorOracle' : 'runScoutOracle'];
}

module.exports = { selectAdapter };
