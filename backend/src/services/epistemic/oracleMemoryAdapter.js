'use strict';

const subjects = require('./oracleMemorySubject');
const values = require('../trinityProvenanceValues');
const checks = require('./oracleMemoryChecks');

async function runMemoryOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !checks.STRATEGIES.has(strategy)) throw values.failure('MEMORY_ORACLE_STRATEGY_UNAVAILABLE');
  const loader = context.nativeMemoryRuntimeSubject ? require('./oracleMemoryRuntimeSubject') : subjects;
  const request = context.nativeMemoryRuntimeSubject || context.nativeMemorySubject;
  const subject = await loader.load(context.db, request);
  subjects.assertAntigen(antigen, subject);
  const result = await require('./oracleNativeProcess').run(subject.content, { kind: 'memory', strategy,
    timeoutMs: require('./oracleProcedureAdapter').executionTimeout(context) });
  if (context.nativeOracleDeadline && Date.now() > context.nativeOracleDeadline) throw values.failure('ORACLE_BUDGET_EXPIRED');
  const current = await loader.load(context.db, request);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('MEMORY_ORACLE_SUBJECT_CHANGED');
  const detail = { ...result.detail, outcome: result.result.status, postconditions: result.result,
    subject: { memoryId: subject.content.memory.id, runId: subject.content.source.runId, bindingHash: values.digest(subject.binding) } };
  if (context.nativeMemoryRuntimeSubject) detail.subject = runtimeBinding(subject, context.nativeOracleAllocationHash);
  return { status: result.result.status, reason: result.result.reason,
    observations: [{ step: 'memory:source_fidelity', result: result.result.status, detail, timestamp: new Date().toISOString() }],
    counterexamples: result.result.status === 'refuted' ? [{ type: 'memory_source_contradiction', description: 'The memory contradicts its recorded promotion report.' }] : [] };
}

module.exports = { runMemoryOracle };

function runtimeBinding(subject, allocationHash) {
  return { runId: subject.runId, workerId: subject.workerId, memoryId: subject.content.memory.id,
    sourceRunId: subject.content.source.runId, memoryBindingHash: subject.memoryBindingHash,
    bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
    observationHash: subject.observationHash, observedAt: subject.observedAt, validUntil: subject.validUntil, allocationHash };
}
