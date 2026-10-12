'use strict';

const values = require('../trinityProvenanceValues');
const contracts = require('./codePostconditionContract');
const store = require('../biologicalWorkerStore');
const { MAX_AGE_MS } = require('./oracleProcedureSubject');

async function load(db, request) {
  const run = await require('../gvxMissionProvenance').readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  if (!run || binding?.workerId !== request.agentId || request.scope.entityId !== request.agentId) throw values.failure('ORACLE_RUNTIME_SUBJECT_MISMATCH');
  const records = await store.observations(db, request.runId);
  const observed = records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
  assertObservation(observed);
  const report = observed.event.payload.evidenceReport.workerArtifact?.content;
  const method = verificationMethod(binding, report);
  contracts.assertInput(method);
  const authority = await require('../missionEnvelopeAuthority').assertRun(db, request);
  if (authority.status !== 'authorized') throw values.failure('ORACLE_AUTHORITY_REQUIRED');
  const source = await require('./codeArtifactSource').load({ method, workspaceRoot: authority.envelope.workspaceRoot });
  assertReport(method.methodId === 'verify_code_postconditions' && !binding.genome.workerContract?.mission?.codeVerificationContract
    ? report : report?.codeVerification, source);
  return { domain: 'code_postconditions', runId: request.runId, workerId: request.agentId,
    workspaceRoot: authority.envelope.workspaceRoot,
    content: { ...source, runId: request.runId, workerId: request.agentId,
      ...(report.verdict ? { verification: { verdict: report.verdict } } : {}) },
    observationHash: observed.hash, observedAt: observed.event.timestamp, runBindingHash: run.hash,
    bindingHash: values.digest({ binding, source, workspaceRoot: authority.envelope.workspaceRoot }),
    validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
}

function verificationMethod(binding, report) {
  const mission = binding.genome.workerContract?.mission || {};
  if (mission.methodContract?.methodId === 'verify_code_postconditions') return mission.methodContract;
  const contract = mission.codeVerificationContract;
  const evidence = report?.codeVerification;
  if (!contract || evidence?.artifactPath !== contract.artifactPath
      || evidence?.contractId !== contract.contractId) throw values.failure('CODE_ORACLE_REPORT_BINDING_MISMATCH');
  return { version: 1, methodId: 'verify_code_postconditions', parameters: {
    artifactPath: contract.artifactPath, contractId: contract.contractId,
    expectedContentHash: evidence.artifactContentHash } };
}

function assertObservation(observed) {
  const age = Date.now() - Date.parse(observed?.event.timestamp);
  if (!observed || !Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) throw values.failure('ORACLE_SOURCE_STALE');
}

function assertReport(report, source) {
  if (report?.testedClaim !== contracts.STATEMENT || report.artifactPath !== source.artifact.path
      || report.artifactContentHash !== source.artifact.contentHash || report.contractId !== source.contract.id
      || report.contractHash !== source.contractHash) throw values.failure('CODE_ORACLE_REPORT_BINDING_MISMATCH');
}

function assertAntigen(antigen, subject) {
  const formal = require('../formalResultService').createFormalResult(antigen?.formalResult);
  if (formal.canonicalStatement !== contracts.STATEMENT || antigen.claim !== contracts.STATEMENT
      || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  if (values.digest(formal.evidence.content) !== values.digest(subject.content)
      || values.digest(formal.validityDomain) !== values.digest({ ...contracts.DOMAIN, constraints: [...contracts.DOMAIN.constraints].sort() })) throw values.failure('ORACLE_SEMANTIC_SUBJECT_MISMATCH');
}

module.exports = { load, assertAntigen, STATEMENT: contracts.STATEMENT, DOMAIN: contracts.DOMAIN };
