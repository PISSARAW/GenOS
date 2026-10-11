'use strict';

const values = require('../trinityProvenanceValues');
const store = require('../biologicalWorkerStore');
const { MAX_AGE_MS } = require('./oracleProcedureSubject');

const STATEMENT = 'Les occurrences littérales du rapport scout concordent avec les sources scannées.';
const DOMAIN = { statement: 'Recherche littérale dans des sources textuelles fournies.',
  constraints: ['Toutes les occurrences rapportées existent à leur offset.',
    'Aucune occurrence présente n’est omise.', 'Les références scannées concordent avec le contrat.'] };

async function load(db, request) {
  const run = await require('../gvxMissionProvenance').readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  const records = await store.observations(db, request.runId);
  assertBinding({ run, binding, request });
  const method = methodFrom(binding);
  const observed = latestObservation(records);
  assertFresh(observed);
  const content = observed.event.payload?.evidenceReport?.workerArtifact?.content;
  assertReport(observed.event.payload?.evidenceReport, content);
  const authority = await require('../missionEnvelopeAuthority').assertRun(db, request);
  return { domain: 'scan_literal', runId: request.runId, workerId: request.agentId,
    workspaceRoot: authority.envelope.workspaceRoot,
    content: { method, output: { observations: content.observations,
      scannedSources: content.scannedSources, termCount: content.termCount, scoutReceipt: content.scoutReceipt } },
    observationHash: observed.hash, observedAt: observed.event.timestamp, runBindingHash: run.hash,
    bindingHash: values.digest({ binding, method, output: content }),
    validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
}

function assertBinding(input) {
  if (!input.run || input.binding?.workerId !== input.request.agentId
      || input.request.scope.entityId !== input.request.agentId) {
    throw values.failure('ORACLE_RUNTIME_SUBJECT_MISMATCH');
  }
}

function methodFrom(binding) {
  const method = binding.genome.workerContract?.mission?.methodContract;
  if (method?.version !== 1 || method.methodId !== 'scan_literal') throw values.failure('ORACLE_DOMAIN_UNAVAILABLE');
  return method;
}

function latestObservation(records) {
  return records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
}

function assertFresh(observed) {
  const age = Date.now() - Date.parse(observed?.event.timestamp);
  if (!observed || !Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) {
    throw values.failure('ORACLE_SOURCE_STALE');
  }
}

function assertReport(report, content) {
  if (report?.outcome !== 'success' || !content || !Array.isArray(content.observations)) {
    throw values.failure('ORACLE_RESULT_OBSERVATION_REQUIRED');
  }
}

function assertAntigen(antigen, subject) {
  const formal = require('../formalResultService').createFormalResult(antigen?.formalResult);
  if (formal.canonicalStatement !== STATEMENT || antigen.claim !== STATEMENT
    || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) {
    throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  }
  if (values.digest(formal.evidence.content) !== values.digest(subject.content)
    || values.digest(formal.validityDomain) !== values.digest({ ...DOMAIN, constraints: [...DOMAIN.constraints].sort() })) {
    throw values.failure('ORACLE_SEMANTIC_SUBJECT_MISMATCH');
  }
}

module.exports = { STATEMENT, DOMAIN, load, assertAntigen };
