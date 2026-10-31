'use strict';

const subjects = require('./oracleWorkspaceSubject');
const values = require('../trinityProvenanceValues');

async function runWorkspaceOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !require('./oracleWorkspaceChecks').STRATEGIES.has(strategy)) {
    throw values.failure('ORACLE_STRATEGY_UNAVAILABLE');
  }
  const subject = await subjects.load(context.db, context.nativeWorkspaceSubject);
  subjects.assertAntigen(antigen, subject);
  const executed = await require('./oracleNativeProcess').run(subject.content, {
    kind: 'workspace', strategy, timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution });
  const detail = { ...executed.detail, outcome: executed.result.status, postconditions: executed.result,
    subject: { runId: subject.runId, workerId: subject.workerId,
      bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
      observationHash: subject.observationHash, observedAt: subject.observedAt,
      validUntil: subject.validUntil, allocationHash: context.nativeOracleAllocationHash } };
  const current = await subjects.load(context.db, context.nativeWorkspaceSubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('ORACLE_SUBJECT_CHANGED');
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'workspace:postconditions', result: executed.result.status, detail,
      timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted'
      ? [{ type: 'workspace_postcondition_false', description: executed.result.reason }] : [] };
}

module.exports = { runWorkspaceOracle };
