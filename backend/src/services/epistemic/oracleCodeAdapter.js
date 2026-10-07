'use strict';

const subjects = require('./oracleCodeSubject');
const values = require('../trinityProvenanceValues');

async function runCodeOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !require('./oracleCodeChecks').STRATEGIES.has(strategy)) throw values.failure('CODE_ORACLE_STRATEGY_UNAVAILABLE');
  const subject = await subjects.load(context.db, context.nativeCodeSubject);
  subjects.assertAntigen(antigen, subject);
  const executed = await require('./oracleNativeProcess').run(subject.content, { kind: 'code', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context), onExecution: context.onOracleExecution });
  const detail = { ...executed.detail, outcome: executed.result.status, postconditions: executed.result,
    subject: { runId: subject.runId, workerId: subject.workerId, bindingHash: subject.bindingHash,
      runBindingHash: subject.runBindingHash, observationHash: subject.observationHash,
      observedAt: subject.observedAt, validUntil: subject.validUntil,
      artifactContentHash: subject.content.artifact.contentHash, contractHash: subject.content.contractHash,
      allocationHash: context.nativeOracleAllocationHash } };
  try { await assertCurrent(context, subject); }
  catch (failure) { return require('./nativeOracleOutcome').failed(detail, 'code:bounded_postconditions', failure); }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'code:bounded_postconditions', result: executed.result.status, detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.counterexample ? [{ type: 'code_postcondition_false',
      description: JSON.stringify(executed.result.counterexample) }] : [] };
}

async function assertCurrent(context, subject) {
  if (context.nativeOracleDeadline && Date.now() > context.nativeOracleDeadline) throw values.failure('ORACLE_BUDGET_EXPIRED');
  const current = await subjects.load(context.db, context.nativeCodeSubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('CODE_ORACLE_SUBJECT_CHANGED');
}

module.exports = { runCodeOracle };
