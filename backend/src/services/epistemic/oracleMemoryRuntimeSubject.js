'use strict';

const values = require('../trinityProvenanceValues');
const memories = require('./oracleMemorySubject');
const store = require('../biologicalWorkerStore');
const { MAX_AGE_MS } = require('./oracleProcedureSubject');

async function load(db, request) {
  const run = await require('../gvxMissionProvenance').readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  if (!run || binding?.workerId !== request.agentId || request.scope.entityId !== request.agentId) {
    throw values.failure('ORACLE_RUNTIME_SUBJECT_MISMATCH');
  }
  const method = binding.genome.workerContract?.mission?.methodContract;
  require('../agents/workerMemoryVerification').assertMemoryInput(method);
  const memory = await memories.load(db, { memoryId: method.parameters.memoryId,
    scope: { organizationId: request.scope.organizationId, projectId: request.scope.projectId } });
  const memoryBindingHash = values.digest(memory.binding);
  if (memoryBindingHash !== method.parameters.expectedBindingHash) throw values.failure('MEMORY_ORACLE_ORIGIN_MISMATCH');
  const records = await store.observations(db, request.runId);
  const observed = records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
  assertObservation(observed);
  const content = observed.event.payload.evidenceReport.workerArtifact?.content;
  assertReport(content, { method, memoryBindingHash });
  return { ...memory, domain: 'memory_fidelity', runId: request.runId, workerId: request.agentId,
    content: { ...memory.content, verification: { runId: request.runId, workerId: request.agentId, verdict: content.verdict } },
    observationHash: observed.hash, observedAt: observed.event.timestamp, runBindingHash: run.hash,
    bindingHash: values.digest({ binding, source: memory.binding }), memoryBindingHash,
    validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
}

function assertObservation(observed) {
  const age = Date.now() - Date.parse(observed?.event.timestamp);
  if (!observed || !Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) throw values.failure('ORACLE_SOURCE_STALE');
}

function assertReport(content, input) {
  if (content?.memoryId !== input.method.parameters.memoryId || content.memoryBindingHash !== input.memoryBindingHash
      || content.testedClaim !== memories.STATEMENT || content.sourceTruth !== 'not_evaluated') {
    throw values.failure('MEMORY_ORACLE_REPORT_BINDING_MISMATCH');
  }
}

module.exports = { load };
