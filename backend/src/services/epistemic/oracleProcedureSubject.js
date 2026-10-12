'use strict';

const values = require('../trinityProvenanceValues');
const provenance = require('../gvxMissionProvenance');
const store = require('../biologicalWorkerStore');
const { createFormalResult } = require('../formalResultService');
const STATEMENT = 'Les postconditions du résultat subset_sum enregistré sont satisfaites.';
const DOMAIN = { statement: 'Subset sum natif sur entiers non négatifs bornés.',
  constraints: ['Chaque indice du témoin est distinct et appartient aux entrées.',
    'La somme du témoin et le nombre de sommes atteignables sont exacts.'] };
const MAX_AGE_MS = 600000;

function denied(code) { throw values.failure(code); }

async function load(db, request) {
  assertRequest(db, request);
  const runBinding = await provenance.readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  assertBinding({ runBinding, binding, request });
  const records = await store.observations(db, request.runId);
  const observed = freshObservation(records);
  return { content: observedContent({ binding, observed, request }), observationHash: observed.hash,
    observedAt: observed.event.timestamp, runBindingHash: runBinding.hash,
    bindingHash: values.digest(binding), validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
}

function assertRequest(db, request) {
  if (!db || !request?.runId || !request.agentId || !request.scope) denied('ORACLE_RUNTIME_SUBJECT_REQUIRED');
}

function assertBinding(input) {
  if (!input.runBinding || input.binding?.workerId !== input.request.agentId
      || input.request.scope.entityId !== input.request.agentId) denied('ORACLE_RUNTIME_SUBJECT_MISMATCH');
}

function freshObservation(records) {
  const observed = records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
  if (!observed) denied('ORACLE_RESULT_OBSERVATION_REQUIRED');
  const age = Date.now() - Date.parse(observed.event.timestamp);
  if (!Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) denied('ORACLE_SOURCE_STALE');
  return observed;
}

function observedContent(input) {
  const { binding, observed, request } = input;
  const assigned = binding.genome.workerContract?.mission?.methodContract;
  const method = subsetMethod(assigned);
  const report = observed.event.payload?.evidenceReport;
  const content = report?.workerArtifact?.content;
  return { runId: request.runId, workerId: request.agentId, method,
    result: receiptResult(content) };
}

function subsetMethod(assigned) {
  if (assigned?.version !== 1) denied('ORACLE_DOMAIN_UNAVAILABLE');
  const wrappers = ['scoped_procedure', 'host_procedure', 'niche_procedure'];
  const method = wrappers.includes(assigned.methodId) ? assigned.parameters?.procedure : assigned;
  if (method?.version !== 1 || method.methodId !== 'subset_sum'
      || ![...wrappers, 'subset_sum'].includes(assigned.methodId)) {
    denied('ORACLE_DOMAIN_UNAVAILABLE');
  }
  return method;
}

function receiptResult(content) {
  const receipt = content?.procedureReceipt;
  const result = content?.result || receipt?.result;
  if (!result || receipt?.methodId !== 'subset_sum'
      || values.digest(content.result || result) !== values.digest(receipt.result)) {
    denied('ORACLE_RESULT_OBSERVATION_REQUIRED');
  }
  const inputDigest = String(receipt.inputDigest || '');
  if (!/^sha256:[a-f0-9]{64}$/.test(inputDigest)
      || !/^solver:\/\/sha256:[a-f0-9]{64}$/.test(receipt.id || '')) {
    denied('ORACLE_RESULT_OBSERVATION_REQUIRED');
  }
  return result;
}

function assertAntigen(antigen, subject) {
  if (!antigen?.formalResult) denied('ORACLE_FORMAL_RESULT_REQUIRED');
  const formal = createFormalResult(antigen.formalResult);
  if (formal.canonicalStatement !== STATEMENT || antigen.claim !== STATEMENT
      || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) {
    denied('ORACLE_CLAIM_BINDING_MISMATCH');
  }
  if (values.digest(formal.evidence.content) !== values.digest(subject.content)
      || values.digest(formal.validityDomain) !== values.digest({ ...DOMAIN, constraints: [...DOMAIN.constraints].sort() })) {
    denied('ORACLE_SEMANTIC_SUBJECT_MISMATCH');
  }
  return formal;
}

module.exports = { STATEMENT, DOMAIN, MAX_AGE_MS, load, assertAntigen };
