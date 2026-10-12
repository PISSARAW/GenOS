'use strict';

const subjects = require('./oracleObservationSubject');
const checks = require('./oracleObservationChecks');
const values = require('../trinityProvenanceValues');
const executor = require('./oracleNativeProcess');

async function runObservationOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !checks.STRATEGIES.has(strategy)) {
    throw values.failure('OBSERVATION_ORACLE_STRATEGY_UNAVAILABLE');
  }
  const subject = await subjects.load(context.db, context.nativeObservationSubject);
  subjects.assertAntigen(antigen, subject);
  const executed = await executor.run(subject, { kind: 'observation', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution });
  const detail = { ...executed.detail, outcome: executed.result.status,
    postconditions: executed.result, subject: { runId: subject.runId, workerId: subject.workerId,
      bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
      observationHash: subject.observationHash, observedAt: subject.observedAt,
      validUntil: subject.validUntil, allocationHash: context.nativeOracleAllocationHash } };
  try { await assertCurrent(context, subject); }
  catch (failure) { return require('./nativeOracleOutcome').failed(detail, `${subject.domain}:postconditions`, failure); }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: `${subject.domain}:postconditions`, result: executed.result.status,
      detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted' ? [{ type: 'observation_postcondition_false',
      description: 'The worker report contradicts the sealed method inputs.' }] : [] };
}

async function assertCurrent(context, subject) {
  if (context.nativeOracleDeadline && Date.now() > context.nativeOracleDeadline) throw values.failure('ORACLE_BUDGET_EXPIRED');
  const current = await subjects.load(context.db, context.nativeObservationSubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('ORACLE_SUBJECT_CHANGED');
}

module.exports = { runObservationOracle };
