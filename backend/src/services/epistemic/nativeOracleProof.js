'use strict';

const values = require('../trinityProvenanceValues');
const journal = require('./nativeOracleJournal');
const subjects = require('./oracleProcedureSubject');

async function read(db, input) {
  const attestation = await journal.read(db, { ...input, kind: 'attestation' });
  if (!attestation || attestation.hash !== input.reference.hash || attestation.eventId !== input.reference.eventId) {
    throw values.failure('ORACLE_ATTESTATION_REFERENCE_INVALID');
  }
  const record = attestation.value;
  assertOwner(record, input);
  const allocation = await journal.read(db, { ...input, kind: 'reservation' });
  assertAllocation(record, allocation);
  const saved = await require('../aeisAssemblyStore').readAssembly(db, record.assemblyId);
  if (saved.runId !== input.runId || saved.scopeId !== record.scopeId || !record.accepted
      || saved.evaluation.allAccepted !== true) throw values.failure('ORACLE_ASSEMBLY_NOT_ACCEPTED');
  return { attestation, allocation, saved };
}

function assertOwner(record, input) {
  if (record.schema !== 'genos.native-oracle-attestation/v1' || record.runId !== input.runId
      || record.agentId !== input.agentId || values.digest(record.scope) !== values.digest(input.scope)) {
    throw values.failure('ORACLE_ATTESTATION_SCOPE_MISMATCH');
  }
}

function assertAllocation(record, allocation) {
  if (!allocation || allocation.hash !== record.allocationHash || allocation.value.subjectHash !== record.subjectHash
      || allocation.value.reportHash !== record.reportHash || allocation.value.authorityHash !== record.authorityHash) {
    throw values.failure('ORACLE_ALLOCATION_BINDING_MISMATCH');
  }
  const limits = allocation.value.limits;
  const costs = record.costs;
  assertCosts(costs, limits);
  const completed = Date.parse(record.completedAt);
  const expires = Date.parse(allocation.value.expiresAt);
  if (!Number.isFinite(completed) || !Number.isFinite(expires) || completed > expires) throw values.failure('ORACLE_BUDGET_EXCEEDED');
}

function assertCosts(costs, limits) {
  if (costs.processes !== 2 || costs.processes > limits.executions || !Number.isFinite(costs.runtimeMs)
      || costs.runtimeMs < 0 || costs.runtimeMs > limits.latencyMs) throw values.failure('ORACLE_BUDGET_EXCEEDED');
}

async function assertCurrent(db, input) {
  const { proof, request, report } = input;
  const authority = await require('../missionEnvelopeAuthority').assertRun(db, request);
  if (authority.hash !== proof.attestation.value.authorityHash) throw values.failure('ORACLE_AUTHORITY_CHANGED');
  const subject = await subjects.load(db, { ...request, scope: proof.attestation.value.scope });
  if (values.digest(subject) !== proof.attestation.value.subjectHash
      || values.digest(report) !== proof.attestation.value.reportHash) throw values.failure('ORACLE_COMPLETION_RESULT_CHANGED');
  if (Date.now() >= Date.parse(proof.attestation.value.validUntil)) throw values.failure('ORACLE_ATTESTATION_EXPIRED');
  const result = proof.saved.evaluation.assembly.results[0];
  subjects.assertAntigen({ id: result.resultId, formalResult: result, claim: result.canonicalStatement,
    epitopes: { evidence: { digest: result.evidence.digest } } }, subject);
  assertReceipts(proof, subject);
}

function assertReceipts(proof, subject) {
  const receipts = proof.saved.evaluation.assembly.verifications;
  const strategies = new Set();
  for (const receipt of receipts) {
    assertReceipt(receipt, subject);
    if (receipt.executionEvidence[0].subject.allocationHash !== proof.allocation.hash) throw values.failure('ORACLE_ALLOCATION_BINDING_MISMATCH');
    strategies.add(receipt.executionEvidence[0].postconditions.strategy);
  }
  if (receipts.length !== 2 || strategies.size !== 2) throw values.failure('ORACLE_INDEPENDENT_QUORUM_REQUIRED');
  const runtimeMs = receipts.reduce((total, receipt) => total + receipt.executionEvidence[0].durationMs, 0);
  if (!Number.isFinite(runtimeMs) || runtimeMs !== proof.attestation.value.costs.runtimeMs) throw values.failure('ORACLE_COST_BINDING_MISMATCH');
}

function assertReceipt(receipt, subject) {
  const execution = receipt.executionEvidence?.[0];
  if (receipt.status !== 'verified' || receipt.independent !== true) throw values.failure('ORACLE_RECEIPT_BINDING_MISMATCH');
  if (receipt.executionEvidence?.length !== 1
      || execution?.subject?.observationHash !== subject.observationHash
      || execution?.subject?.bindingHash !== subject.bindingHash) throw values.failure('ORACLE_RECEIPT_BINDING_MISMATCH');
  assertReceiptOwner(execution, subject);
  assertReceiptTime(receipt, subject);
  if (!require('./oracleSubsetChecks').STRATEGIES.has(execution.postconditions?.strategy)
      || execution.postconditions?.status !== 'verified') throw values.failure('ORACLE_STRATEGY_UNAVAILABLE');
}

function assertReceiptOwner(execution, subject) {
  if (execution.subject.runId !== subject.content.runId || execution.subject.workerId !== subject.content.workerId
      || execution.subject.runBindingHash !== subject.runBindingHash) throw values.failure('ORACLE_RECEIPT_BINDING_MISMATCH');
}

function assertReceiptTime(receipt, subject) {
  const checked = Date.parse(receipt.checkedAt);
  if (!Number.isFinite(checked) || checked < Date.parse(subject.observedAt) - 60000
      || checked > Date.now() + 60000 || checked > Date.parse(subject.validUntil)) throw values.failure('ORACLE_RECEIPT_STALE');
}

function context(proof) {
  const evaluation = { ...proof.saved.evaluation, persistedAssemblyId: proof.attestation.value.assemblyId };
  return { evidenceVerified: true, independentVerification: true, epistemicAssembly: evaluation.assembly,
    independentVerifierReceipt: evaluation.assembly.verifications[0], aeisEvaluation: evaluation,
    trustedVerifierDigests: proof.saved.manifest.trustedDigests };
}

module.exports = { read, assertCurrent, context };
