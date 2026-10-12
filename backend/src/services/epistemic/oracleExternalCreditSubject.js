'use strict';

const fs = require('node:fs');
const values = require('../trinityProvenanceValues');
const provenance = require('../gvxMissionProvenance');
const store = require('../biologicalWorkerStore');

async function load(db, request) {
  assertRequest(db, request);
  const { runBinding, binding } = await readBinding(db, request);
  const observed = await latestObservation(db, request.runId);
  const method = binding.genome.workerContract?.mission?.methodContract;
  const lease = binding.genome.workerContract?.mission?.externalCreditLease;
  const report = observed.event.payload?.evidenceReport;
  const content = assertCreditEvidence(method, lease, report);
  const account = accountFor(method.parameters);
  const publicKeyPath = process.env.GENOS_EXTERNAL_CREDIT_PUBLIC_KEY_PATH;
  if (!publicKeyPath) throw values.failure('ORACLE_EXTERNAL_CREDIT_TRUST_KEY_MISSING');
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  const subject = { runId: request.runId, workerId: request.agentId, method,
    account, lease, receipt: content.creditReceipt, workerObservation: content.creditObservation,
    independentObservation: content.creditObservation,
    publicKey };
  const contentHash = values.digest(subject);
  return { content: subject, contentHash, bindingHash: values.digest(binding), runBindingHash: runBinding.hash,
    observationHash: values.digest(observed), observedAt: observed.event.timestamp,
    // Verification freshness remains strict in oracleExternalCreditChecks; this
    // validity window only lets the parent cite the durable signed proof after
    // a long, multi-stage mission has finished.
    validUntil: new Date(Date.parse(content.creditObservation.statement.observedAt) + 600000).toISOString() };
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

async function latestObservation(db, runId) {
  const records = await store.observations(db, runId);
  const observed = records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
  if (!observed) throw values.failure('ORACLE_RESULT_OBSERVATION_REQUIRED');
  return observed;
}

function assertCreditEvidence(method, lease, report) {
  const content = report?.workerArtifact?.content;
  if (method?.methodId === 'replenish_external_quota' && content?.creditReceipt
    && content?.creditObservation && lease) return content;
  throw values.failure('ORACLE_DOMAIN_UNAVAILABLE');
}

function accountFor(input) {
  return { tenantId: input.tenantId, missionId: input.missionId,
    agentId: input.agentId, capacity: input.capacity };
}

function assertAntigen(antigen, subject) {
  const evidence = antigen?.formalResult?.evidence?.content;
  if (!evidence) throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  if (values.digest(evidence) !== subject.contentHash
    || antigen.claim !== 'The scoped external credit refill and fresh provider balance are valid.') {
    throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  }
}

module.exports = { load, assertAntigen };
