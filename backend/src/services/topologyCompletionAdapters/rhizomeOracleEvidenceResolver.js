'use strict';

const workerStore = require('../biologicalWorkerStore');
const nativeGate = require('../epistemic/nativeOracleGate');
const nativeProof = require('../epistemic/nativeOracleProof');

function result(status, reason, extra = {}) {
  return { status, ...(reason ? { reason } : {}), ...extra };
}

function terminalObservation(observations) {
  const terminal = observations.filter((item) => item.applied
    && ['AGENT_COMPLETED', 'WORKER_NO_ANSWER_PROVEN'].includes(item.event?.eventType));
  return terminal.length === 1 ? terminal[0].event : null;
}

function sameProducer(input) {
  const { binding, receipt, missionId } = input;
  return binding?.runId === receipt?.runId
    && binding?.workerId === receipt?.workerId
    && binding?.missionId === receipt?.missionId
    && receipt?.missionId === missionId;
}

function verifierIdentity(receipt) {
  const descriptor = receipt.independenceDescriptor || {};
  return descriptor.actorId || descriptor.executionId || null;
}

function verifiedVerifiers(proof, producerId) {
  const receipts = proof?.saved?.evaluation?.assembly?.verifications;
  if (!Array.isArray(receipts) || receipts.length !== 2) return null;
  const identities = receipts.map(verifierIdentity);
  const valid = receipts.every((receipt, index) => receipt.independent === true
    && identities[index] && identities[index] !== producerId
    && receipt.executionEvidence?.[0]?.subject?.workerId === producerId);
  return valid && new Set(identities).size === identities.length ? identities : null;
}

function referenceMatches(reference, historical) {
  return reference?.schema === 'genos.native-oracle-receipt-reference/v1'
    && reference.eventId === historical.proof.attestation.eventId
    && reference.hash === historical.proof.attestation.hash
    && reference.acceptanceHash === historical.acceptance.hash
    && reference.budgetAssessment?.satisfied === true
    && historical.acceptance.value.status === 'completed';
}

async function resolvedEvidence(db, input, event) {
  const request = { runId: input.receipt.runId, agentId: input.receipt.workerId };
  const historical = await nativeGate.historical(db, { ...request, event });
  if (!historical || !referenceMatches(input.receipt.semanticVerification, historical)) return null;
  await nativeProof.assertCompletedEvidence(db, { proof: historical.proof, request,
    report: event.payload?.evidenceReport || event.payload?.report });
  const verifierIds = verifiedVerifiers(historical.proof, input.receipt.workerId);
  if (!verifierIds) return null;
  return { missionId: input.missionId, runId: input.receipt.runId,
    workerId: input.receipt.workerId, verifierIds,
    attestationHash: historical.proof.attestation.hash,
    acceptanceHash: historical.acceptance.hash,
    evidenceRefs: [historical.proof.attestation.eventId,
      historical.acceptance.eventId, historical.proof.attestation.value.assemblyId] };
}

async function resolve(db, input = {}) {
  if (!input.receipt?.semanticVerification) {
    return result('partial', 'rhizome_independent_oracle_missing');
  }
  if (!sameProducer(input)) return result('failed', 'rhizome_independent_oracle_invalid');
  try {
    const observations = await workerStore.observations(db, input.receipt.runId);
    const event = terminalObservation(observations);
    if (!event) return result('failed', 'rhizome_independent_oracle_invalid');
    const evidence = await resolvedEvidence(db, input, event);
    return evidence ? result('verified', null, evidence)
      : result('failed', 'rhizome_independent_oracle_invalid');
  } catch (_) { return result('failed', 'rhizome_independent_oracle_invalid'); }
}

module.exports = { resolve };
