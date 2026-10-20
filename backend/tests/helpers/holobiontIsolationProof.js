'use strict';

const policy = require('../../src/services/holobionte/runtime/capabilityExecutionPolicy');
const admission = require('../../src/services/holobionte/symbionts/symbiontAdmissionService');

function fixtureProvenance(id = 'fixture-trial-adapter') {
  return { schema: policy.ADAPTER_PROVENANCE_SCHEMA, role: 'trial', adapterId: id,
    implementationHash: `sha256:${'1'.repeat(64)}`, proofHash: `sha256:${'2'.repeat(64)}` };
}

function isolationProof(adapterProvenance, id = 'fixture-isolation') {
  const evidenceRef = `isolation-proof:${id}`;
  return { schema: admission.ISOLATION_PROOF_SCHEMA, status: 'VERIFIED', isolationId: id,
    mechanism: 'test-fixture-process-sandbox', adapterProofHash: adapterProvenance.proofHash,
    observedAt: '2026-10-20T00:00:00.000Z', evidenceRefs: [evidenceRef],
    boundaries: { process: 'ISOLATED', workspace: 'EPHEMERAL', network: 'DENIED' } };
}

function admissionIsolation(id = 'fixture-isolation') {
  const producer = fixtureProvenance();
  const proof = isolationProof(producer, id);
  return { isolationProof: proof, producer, evidenceRef: proof.evidenceRefs[0] };
}

function withIsolationEvidence(output, evidenceRefs = []) {
  return [...evidenceRefs, ...(output.isolationProof?.evidenceRefs || [])];
}

module.exports = { admissionIsolation, isolationProof, withIsolationEvidence };
