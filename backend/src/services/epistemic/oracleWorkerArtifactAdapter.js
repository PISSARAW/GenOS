'use strict';

const subjects = require('./oracleWorkerArtifactSubject');
const checks = require('./oracleWorkerArtifactChecks.cjs');
const values = require('../trinityProvenanceValues');

async function runWorkerArtifactOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !checks.STRATEGIES.has(strategy)) {
    throw values.failure('WORKER_ARTIFACT_ORACLE_STRATEGY_UNAVAILABLE');
  }
  const request = context.nativeOracleSubject;
  const subject = await subjects.load(context.db, request);
  subjects.assertAntigen(antigen, subject);
  const executed = await require('./oracleNativeProcess').run(subject, {
    kind: 'worker-artifact', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution });
  const detail = { ...executed.detail, outcome: executed.result.status, postconditions: executed.result,
    subject: { runId: subject.runId, workerId: subject.workerId, bindingHash: subject.bindingHash,
      runBindingHash: subject.runBindingHash, observationHash: subject.observationHash,
      observedAt: subject.observedAt, validUntil: subject.validUntil,
      allocationHash: context.nativeOracleAllocationHash || null } };
  const current = await subjects.load(context.db, request);
  if (values.digest(current) !== values.digest(subject)) {
    return require('./nativeOracleOutcome').failed(detail, 'worker_artifact:sealed_contract',
      values.failure('ORACLE_SUBJECT_CHANGED'));
  }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: `worker_artifact:${strategy}`, result: executed.result.status,
      detail, timestamp: new Date().toISOString() }], counterexamples: [] };
}

module.exports = { runWorkerArtifactOracle };
