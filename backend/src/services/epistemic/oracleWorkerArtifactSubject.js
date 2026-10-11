'use strict';

const values = require('../trinityProvenanceValues');
const provenance = require('../gvxMissionProvenance');
const store = require('../biologicalWorkerStore');

async function load(db, request) {
  assertRequest(db, request);
  const { runBinding, binding } = await readBinding(db, request);
  const observed = await latestEvidence(db, request.runId);
  const workerContract = binding.genome.workerContract;
  const methodContract = workerContract?.mission?.methodContract;
  const report = observed.event.payload?.evidenceReport;
  assertArtifactInputs(workerContract, methodContract, report);
  const content = { runId: request.runId, workerId: request.agentId,
    workerKind: binding.genome.role, workerContract, methodContract, report };
  return { domain: 'worker_artifact', runId: request.runId, workerId: request.agentId,
    content, contentHash: values.digest(content), bindingHash: values.digest(binding),
    runBindingHash: runBinding.hash, observationHash: values.digest(observed),
    observedAt: observed.event.timestamp,
    validUntil: new Date(Date.parse(observed.event.timestamp) + 600000).toISOString() };
}

function assertRequest(db, request) {
  if (db && request?.runId && request.agentId && request.scope) return;
  throw values.failure('ORACLE_RUNTIME_SUBJECT_REQUIRED');
}

async function readBinding(db, request) {
  const runBinding = await provenance.readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  if (!runBinding || binding?.workerId !== request.agentId || request.scope.entityId !== request.agentId) {
    throw values.failure('ORACLE_RUNTIME_SUBJECT_MISMATCH');
  }
  return { runBinding, binding };
}

async function latestEvidence(db, runId) {
  const records = await store.observations(db, runId);
  const observed = records.filter(item => item?.applied && item.event?.eventType === 'EVIDENCE_REPORT').at(-1);
  if (!observed) throw values.failure('ORACLE_RESULT_OBSERVATION_REQUIRED');
  return observed;
}

function assertArtifactInputs(workerContract, methodContract, report) {
  if (workerContract && methodContract && report) return;
  throw values.failure('ORACLE_DOMAIN_UNAVAILABLE');
}

function assertAntigen(antigen, subject) {
  const evidence = antigen?.formalResult?.evidence?.content;
  if (!evidence || values.digest(evidence) !== subject.contentHash
    || antigen.claim !== 'The native worker artifact matches its sealed kind, method and evidence contract.') {
    throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  }
}

module.exports = { load, assertAntigen };
