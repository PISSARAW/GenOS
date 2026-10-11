'use strict';

const values = require('../trinityProvenanceValues');
const store = require('../biologicalWorkerStore');
const { MAX_AGE_MS } = require('./oracleProcedureSubject');
const STATEMENT = 'Les anomalies et la fenêtre mesurée du rapport monitor concordent avec ses échantillons.';
const DOMAIN = { statement: 'Surveillance déterministe d’échantillons référencés.', constraints: [
  'Une anomalie correspond exactement à une valeur strictement supérieure au seuil.',
  'Toutes les références et la date la plus récente sont reprises dans le rapport.',
  'Le reçu est lié au contrat de méthode et au contenu mesuré.'] };
async function load(db, request) {
  const run = await require('../gvxMissionProvenance').readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  assertBinding({ run, binding, request });
  const method = methodFrom(binding);
  const observed = freshObservation(await store.observations(db, request.runId));
  const output = observedOutput(observed);
  const authority = await require('../missionEnvelopeAuthority').assertRun(db, request);
  return buildSubject({ run, binding, request, method, observed, output, authority });
}
function assertBinding(input) {
  if (!input.run || input.binding?.workerId !== input.request.agentId
      || input.request.scope.entityId !== input.request.agentId) throw values.failure('ORACLE_RUNTIME_SUBJECT_MISMATCH');
}
function methodFrom(binding) {
  const method = binding.genome.workerContract?.mission?.methodContract;
  if (method?.version !== 1 || method.methodId !== 'monitor_samples') throw values.failure('ORACLE_DOMAIN_UNAVAILABLE');
  return method;
}
function freshObservation(records) {
  const observed = records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
  const age = Date.now() - Date.parse(observed?.event.timestamp);
  if (!observed || !Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) throw values.failure('ORACLE_SOURCE_STALE');
  return observed;
}
function observedOutput(observed) {
  const report = observed.event.payload?.evidenceReport;
  const output = report?.workerArtifact?.content;
  if (report?.outcome !== 'success' || !output || !Array.isArray(output.anomalies)) throw values.failure('ORACLE_RESULT_OBSERVATION_REQUIRED');
  return output;
}
function buildSubject(input) {
  const { run, binding, request, method, observed, output, authority } = input;
  return { domain: 'monitor_samples', runId: request.runId, workerId: request.agentId,
    workspaceRoot: authority.envelope.workspaceRoot, method,
    output: { threshold: output.threshold, sampleCount: output.sampleCount, anomalies: output.anomalies,
      territoryReport: output.territoryReport, monitorReceipt: output.monitorReceipt },
    observationHash: observed.hash, observedAt: observed.event.timestamp, runBindingHash: run.hash,
    bindingHash: values.digest({ binding, method, output }),
    validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
}
function assertAntigen(antigen, subject) {
  const formal = require('../formalResultService').createFormalResult(antigen?.formalResult);
  if (formal.canonicalStatement !== STATEMENT || antigen.claim !== STATEMENT
    || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) {
    throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  }
  if (values.digest(formal.evidence.content) !== values.digest(subject)
    || values.digest(formal.validityDomain) !== values.digest({ ...DOMAIN, constraints: [...DOMAIN.constraints].sort() })) {
    throw values.failure('ORACLE_SEMANTIC_SUBJECT_MISMATCH');
  }
}
module.exports = { STATEMENT, DOMAIN, load, assertAntigen };
