'use strict';

const subjects = require('./oracleMemorySubject');
const values = require('../trinityProvenanceValues');
const checks = require('./oracleMemoryChecks');

async function runMemoryOracle(antigen, verifier, context) {
  const strategy = verifier.strategy?.[0];
  if (verifier.strategy?.length !== 1 || !checks.STRATEGIES.has(strategy)) throw values.failure('MEMORY_ORACLE_STRATEGY_UNAVAILABLE');
  const subject = await subjects.load(context.db, context.nativeMemorySubject);
  subjects.assertAntigen(antigen, subject);
  const result = await require('./oracleNativeProcess').run(subject.content, { kind: 'memory', strategy, timeoutMs: context.timeoutMs });
  const current = await subjects.load(context.db, context.nativeMemorySubject);
  if (values.digest(current) !== values.digest(subject)) throw values.failure('MEMORY_ORACLE_SUBJECT_CHANGED');
  const detail = { ...result.detail, outcome: result.result.status, postconditions: result.result,
    subject: { memoryId: subject.content.memory.id, runId: subject.content.source.runId, bindingHash: values.digest(subject.binding) } };
  return { status: result.result.status, reason: result.result.reason,
    observations: [{ step: 'memory:source_fidelity', result: result.result.status, detail, timestamp: new Date().toISOString() }],
    counterexamples: result.result.status === 'refuted' ? [{ type: 'memory_source_contradiction', description: 'The memory contradicts its recorded promotion report.' }] : [] };
}

module.exports = { runMemoryOracle };
