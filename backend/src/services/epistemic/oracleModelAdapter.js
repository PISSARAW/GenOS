'use strict';

const subjectStore = require('./oracleModelSubject');
const values = require('../trinityProvenanceValues');
const { STRATEGIES } = require('./oracleModelChecks');

async function runModelOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !STRATEGIES.has(strategy)) {
    throw values.failure('ORACLE_STRATEGY_UNAVAILABLE');
  }
  const subject = await subjectStore.load(context.db, context.nativeModelSubject);
  subjectStore.assertAntigen(antigen, subject);
  const executed = await require('./oracleNativeProcess').run(subject.content, {
    kind: 'model', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution });
  const detail = { ...executed.detail, outcome: executed.result.status,
    subject: { runId: subject.runId, workerId: subject.workerId,
      bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
      observationHash: subject.observationHash, observedAt: subject.observedAt,
      validUntil: subject.validUntil, allocationHash: context.nativeOracleAllocationHash },
    postconditions: executed.result };
  try { await assertCurrent(context, subject); }
  catch (failure) { return require('./nativeOracleOutcome').failed(detail,
    'model:semantic_postconditions', failure); }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'model:semantic_postconditions', result: executed.result.status,
      detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted' ? [{ type: 'model_postcondition_false',
      description: 'The observed model response contradicts independently checked subset postconditions.' }] : [] };
}

async function assertCurrent(context, subject) {
  if (context.nativeOracleDeadline && Date.now() > context.nativeOracleDeadline) {
    throw values.failure('ORACLE_BUDGET_EXPIRED');
  }
  const current = await subjectStore.load(context.db, context.nativeModelSubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('ORACLE_SUBJECT_CHANGED');
}

module.exports = { runModelOracle };
