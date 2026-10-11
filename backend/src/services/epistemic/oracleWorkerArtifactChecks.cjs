'use strict';

const STRATEGIES = new Set(['typed_artifact_contract', 'sealed_method_binding']);
function result(status, reason, strategy) { return { schema: 'genos.native-worker-artifact-oracle/v1', status, reason, strategy }; }

function verify(subject, strategy) {
  if (!STRATEGIES.has(strategy)) return result('inconclusive', 'oracle_strategy_unavailable', strategy);
  const value = subject?.content;
  if (!value?.workerContract || !value?.report || !value?.methodContract) return result('inconclusive', 'oracle_subject_invalid', strategy);
  if (!validMethodBinding(value)) {
    return result('refuted', 'sealed_kind_or_method_binding_invalid', strategy);
  }
  if (!strategyValid(value, strategy)) return result('refuted', reasonFor(strategy), strategy);
  return result('verified', strategy, strategy);
}

function validMethodBinding(value) {
  const contract = value.workerContract;
  const kind = value.workerKind;
  const method = value.methodContract;
  return contract.identity?.workerKind === kind
    && contract.mission?.methodContract?.version === method.version
    && contract.mission?.methodContract?.methodId === method.methodId
    && require('../agents/workerExecutorRegistry').hasNativeMethod(kind, method.methodId);
}

function strategyValid(value, strategy) {
  if (strategy === 'sealed_method_binding') return validProvenance(value.report);
  return validTypedArtifact(value);
}

function validProvenance(report) {
  const refs = report.workerArtifact?.provenance?.sourceRefs;
  const claims = report.claims;
  return Array.isArray(refs) && refs.length > 0
    && refs.every(ref => typeof ref === 'string' && !!ref.trim())
    && Array.isArray(claims) && claims.every(claim => Array.isArray(claim.evidence)
      && claim.evidence.every(ref => refs.includes(ref)));
}

function validTypedArtifact(value) {
  try {
    require('../agents/workerArtifactContract').validateWorkerArtifact({
      events: [{ evidenceReport: value.report }]
    }, { agentId: value.workerId, workerContract: value.workerContract });
    return true;
  } catch (_) { return false; }
}

function reasonFor(strategy) {
  return strategy === 'sealed_method_binding'
    ? 'artifact_provenance_does_not_bind_claims' : 'typed_artifact_contract_invalid';
}

module.exports = { STRATEGIES, verify };
