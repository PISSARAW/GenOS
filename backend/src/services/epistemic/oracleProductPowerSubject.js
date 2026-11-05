'use strict';

const contract = require('../productPowerDifference/contract');
const values = require('../trinityProvenanceValues');

async function load(db, request) {
  const base = await require('./oracleWorkerArtifactSubject').load(db, request);
  const method = base.content.methodContract;
  if (method.version !== 1 || method.methodId !== 'prompt_defined'
      || method.evaluator?.domain !== contract.DOMAIN || method.evaluator.version !== 1
      || !contract.premisesValid(method.parameters?.premises)) throw values.failure('ORACLE_EQUATION_METHOD_REQUIRED');
  const calls = await db.all(`SELECT id,agent_id,model,input_tokens,output_tokens FROM model_attempt_ledger
    WHERE mission_id=? AND agent_id=? AND provider_called=1 AND status='completed' AND token_usage_source='provider'`,
  request.runId, request.agentId);
  if (!calls.length || !calls.every(call => call.input_tokens > 0 && call.output_tokens > 0)) {
    throw values.failure('ORACLE_EQUATION_REAL_MODEL_USAGE_REQUIRED');
  }
  return { domain: contract.DOMAIN, runId: base.runId, workerId: base.workerId, method,
    result: { candidate: contract.parse(base.content.report), source: base.content }, providerEvidence: calls,
    bindingHash: base.bindingHash, runBindingHash: base.runBindingHash,
    observationHash: base.observationHash, observedAt: base.observedAt, validUntil: base.validUntil,
    artifactRefs: base.content.report.workerArtifact?.provenance?.sourceRefs || [] };
}

module.exports = { load };
