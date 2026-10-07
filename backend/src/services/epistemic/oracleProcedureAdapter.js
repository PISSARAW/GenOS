'use strict';

const subjectStore = require('./oracleProcedureSubject');
const executor = require('./oracleNativeProcess');
const values = require('../trinityProvenanceValues');
const { STRATEGIES } = require('./oracleSubsetChecks');

async function runProcedureOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !STRATEGIES.has(strategy)) throw values.failure('ORACLE_STRATEGY_UNAVAILABLE');
  const subject = await subjectStore.load(context.db, context.nativeOracleSubject);
  subjectStore.assertAntigen(antigen, subject);
  const executed = await executor.run(subject.content, { strategy, timeoutMs: context.timeoutMs });
  const current = await subjectStore.load(context.db, context.nativeOracleSubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('ORACLE_SUBJECT_CHANGED');
  const detail = { ...executed.detail, outcome: executed.result.status,
    subject: { runId: subject.content.runId, workerId: subject.content.workerId,
      bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
      observationHash: subject.observationHash, observedAt: subject.observedAt, validUntil: subject.validUntil },
    postconditions: executed.result };
  return { status: executed.result.status, reason: executed.result.reason,
    observations: [{ step: 'procedure:semantic_postconditions', result: executed.result.status,
      detail, timestamp: new Date().toISOString() }],
    counterexamples: executed.result.status === 'refuted' ? [{ type: 'subset_postcondition_false',
      description: 'The observed solver result contradicts independently computed subset postconditions.' }] : [] };
}

function executedVerifier(verifier, outcome) {
  const detail = outcome.observations?.find(item => item.detail?.executionId)?.detail;
  if (!detail) return { ...verifier, executionWorkspace: undefined };
  const strategy = detail.postconditions.strategy || verifier.strategy[0];
  return { id: detail.executionId, type: 'procedure_semantic',
    verifierDigest: require('../verifierTrustRegistry').ensureVerifier('procedure_semantic').digest,
    actorId: `native-oracle-${detail.processId}-${detail.executionId}`,
    model: `${process.version}:${strategy}`, version: '1.0', strategy: [strategy],
    workspaceId: detail.cwd, executionWorkspace: detail.cwd,
    executionId: detail.executionId, contextDigest: detail.inputDigest };
}

module.exports = { runProcedureOracle, executedVerifier };
