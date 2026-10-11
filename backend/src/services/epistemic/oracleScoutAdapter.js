'use strict';

const subjects = require('./oracleScoutSubject');
const checks = require('./oracleScoutChecks');
const values = require('../trinityProvenanceValues');

async function runScoutOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !checks.STRATEGIES.has(strategy)) {
    throw values.failure('SCOUT_ORACLE_STRATEGY_UNAVAILABLE');
  }
  const request = context.nativeScoutSubject;
  const subject = await subjects.load(context.db, request);
  subjects.assertAntigen(antigen, subject);
  const executed = await require('./oracleNativeProcess').run(subject.content, {
    kind: 'scout', strategy, timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution });
  const detail = { ...executed.detail, outcome: executed.result.status, postconditions: executed.result,
    subject: { runId: subject.runId, workerId: subject.workerId, bindingHash: subject.bindingHash,
      runBindingHash: subject.runBindingHash, observationHash: subject.observationHash,
      observedAt: subject.observedAt, validUntil: subject.validUntil,
      allocationHash: context.nativeOracleAllocationHash } };
  try { await assertCurrent(subject, { context, request }); }
  catch (failure) { return require('./nativeOracleOutcome').failed(detail, 'scout:literal_postconditions', failure); }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'scout:literal_postconditions', result: executed.result.status,
      detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted' ? [{ type: 'scout_literal_postcondition_false',
      description: 'The reported matches or scout receipt differ from the supplied literal sources.' }] : [] };
}

async function assertCurrent(subject, input) {
  if (input.context.nativeOracleDeadline && Date.now() > input.context.nativeOracleDeadline) {
    throw values.failure('ORACLE_BUDGET_EXPIRED');
  }
  const current = await subjects.load(input.context.db, input.request);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('SCOUT_ORACLE_SUBJECT_CHANGED');
}

module.exports = { runScoutOracle };
