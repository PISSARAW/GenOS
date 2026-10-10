'use strict';
const subjectStore = require('./oracleWorkerSubject');
const values = require('../trinityProvenanceValues');
const { STRATEGIES } = require('./oracleWorkerChecks');

async function runWorkerOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !STRATEGIES.has(strategy)) {
    throw values.failure('ORACLE_STRATEGY_UNAVAILABLE');
  }
  const subject = await subjectStore.load(context.db, context.nativeWorkerSubject);
  subjectStore.assertAntigen(antigen, subject);
  const executed = await require('./oracleNativeProcess').run(subject.content, {
    kind: 'worker', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution
  });
  const detail = { ...executed.detail, outcome: executed.result.status,
    subject: { runId: subject.runId, workerId: subject.workerId,
      bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
      observationHash: subject.observationHash, observedAt: subject.observedAt,
      validUntil: subject.validUntil, allocationHash: context.nativeOracleAllocationHash },
    postconditions: executed.result };
  try { await assertCurrent(context, subject); }
  catch (failure) { return require('./nativeOracleOutcome').failed(detail, 'worker:semantic_postconditions', failure); }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'worker:semantic_postconditions', result: executed.result.status,
      detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted' ? [{ type: 'worker_postcondition_false',
      description: 'The observed native result contradicts its independently checked method contract.' }] : [] };
}

async function assertCurrent(context, subject) {
  if (context.nativeOracleDeadline && Date.now() > context.nativeOracleDeadline) {
    throw values.failure('ORACLE_BUDGET_EXPIRED');
  }
  const current = await subjectStore.load(context.db, context.nativeWorkerSubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('ORACLE_SUBJECT_CHANGED');
}

module.exports = { runWorkerOracle };
