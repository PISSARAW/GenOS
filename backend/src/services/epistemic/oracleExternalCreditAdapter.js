'use strict';

const subjectStore = require('./oracleExternalCreditSubject');
const executor = require('./oracleNativeProcess');
const values = require('../trinityProvenanceValues');
const { STRATEGIES } = require('./oracleExternalCreditChecks.cjs');

async function runExternalCreditOracle(antigen, verifier, context) {
  const strategy = assertStrategy(verifier);
  const subject = await subjectStore.load(context.db, context.nativeOracleSubject);
  subjectStore.assertAntigen(antigen, subject);
  const executed = await executor.run(subject.content, { kind: 'credit', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context),
    onExecution: context.onOracleExecution });
  const detail = detailFor(executed, subject, context.nativeOracleAllocationHash);
  try {
    if (context.nativeOracleDeadline && Date.now() > context.nativeOracleDeadline) throw values.failure('ORACLE_BUDGET_EXPIRED');
    const current = await subjectStore.load(context.db, context.nativeOracleSubject);
    if (!sameSubject(current, subject)) {
      throw values.failure('ORACLE_SUBJECT_CHANGED');
    }
  } catch (failure) {
    return require('./nativeOracleOutcome').failed(detail, 'external_credit:signature_and_balance', failure);
  }
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'external_credit:signature_and_balance', result: executed.result.status,
      detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted' ? [{ type: 'external_credit_proof_invalid',
      description: 'Signed provider evidence does not satisfy the external resource contract.' }] : [] };
}

function assertStrategy(verifier) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length === 1 && STRATEGIES.has(strategy)) return strategy;
  throw values.failure('ORACLE_STRATEGY_UNAVAILABLE');
}

function detailFor(executed, subject, allocationHash) {
  const detail = { ...executed.detail, outcome: executed.result.status,
    subject: { runId: subject.content.runId, workerId: subject.content.workerId,
      bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
      observationHash: subject.observationHash, contentHash: subject.contentHash,
      observedAt: subject.observedAt, validUntil: subject.validUntil }, postconditions: executed.result };
  if (allocationHash) detail.subject.allocationHash = allocationHash;
  return detail;
}

function sameSubject(current, original) {
  const first = original.content.independentObservation.statement;
  const latest = current.content.independentObservation.statement;
  return current.contentHash === original.contentHash && current.bindingHash === original.bindingHash
    && current.runBindingHash === original.runBindingHash && current.observationHash === original.observationHash
    && latest.balance === first.balance && latest.accountVersion === first.accountVersion;
}

module.exports = { runExternalCreditOracle };
