'use strict';
const values = require('../trinityProvenanceValues');
const provenance = require('../gvxMissionProvenance');
const store = require('../biologicalWorkerStore');
const { createFormalResult } = require('../formalResultService');

const STATEMENT = 'Les postconditions de la méthode native observée sont satisfaites.';
const DOMAIN = { statement: 'Postconditions de méthodes natives structurées.',
  constraints: ['Le contrat et le résultat observé sont liés au même worker.',
    'Les sorties sont recalculées depuis les entrées scellées.'] };
const MAX_AGE_MS = 600000;
const METHODS = new Set(['scan_literal', 'monitor_samples', 'synthesize_claims',
  'trace_declared_causes', 'prepare_handoff', 'review_synthetic_case',
  'verify_procedure', 'falsify_procedure', 'combine_candidates', 'measure_lpt']);
function denied(code) { throw values.failure(code); }

async function load(db, request) {
  assertRequest(db, request);
  const runBinding = await provenance.readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  assertBinding({ runBinding, binding, request });
  const method = binding.genome.workerContract?.mission?.methodContract;
  if (method?.version !== 1 || !METHODS.has(method.methodId)) denied('ORACLE_DOMAIN_UNAVAILABLE');
  const records = await store.observations(db, request.runId);
  const observed = freshObservation(records);
  const artifact = observed.event.payload?.evidenceReport?.workerArtifact;
  if (!artifact?.content) denied('ORACLE_RESULT_OBSERVATION_REQUIRED');
  return { domain: 'worker_native', runId: request.runId, workerId: request.agentId,
    content: { runId: request.runId, workerId: request.agentId, method, artifact },
    observationHash: observed.hash, observedAt: observed.event.timestamp,
    runBindingHash: runBinding.hash, bindingHash: values.digest(binding),
    validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
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

module.exports = { STATEMENT, DOMAIN, MAX_AGE_MS, METHODS, load, assertAntigen };
