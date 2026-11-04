'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { createMessage } = require('../evidenceProtocol/contract');

function claim(binding, verification) {
  const proof = verification.proof;
  const record = proof.attestation.value;
  return { claimId: digest([binding.runId, proof.attestation.hash]),
    subject: { artifactDigest: verification.missionReportDigest, baseDigest: `sha256:${record.allocationHash}`,
      environmentDigest: digest([binding.authority, record.authorityHash]) },
    predicate: { command: `genos:native-oracle:${record.domain}`, expectedExitCode: 0 },
    assumptions: ['Native oracle validity domain and sealed execution authority remain current.'],
    domain: { fingerprint: digest(record.domain), description: record.domain },
    evidence: [proof.attestation.eventId], obligations: ['native-independent-quorum'],
    provenance: { producerId: binding.agentId, sourceRefs: [record.assemblyId] },
    dependencies: [], policy: { policyId: 'mission-native-oracle', version: '1' } };
}

function message(binding, input) {
  const key = digest([binding.runId, input.claimId, input.type]);
  return createMessage({ messageId: key, operationId: binding.runId, missionId: binding.missionId,
    conversationId: binding.runId, sender: binding.actor, scope: binding.scope,
    generations: binding.generations, authority: binding.authority,
    type: input.type, payload: input.payload, causalRefs: input.cause ? [input.cause] : [],
    idempotencyKey: key, createdAt: input.createdAt, expiresAt: input.expiresAt });
}

function request(binding, value) {
  return { claimId: value.claimId, subject: value.subject, policy: value.policy,
    scope: binding.scope, missionId: binding.missionId, conversationId: binding.runId,
    generations: binding.generations };
}

function messageTimes(binding, verification) {
  if (verification.delegated) return { createdAt: new Date().toISOString(), expiresAt: binding.expiresAt };
  const attestation = verification.proof.attestation.value;
  return { createdAt: attestation.completedAt, expiresAt: attestation.validUntil };
}

module.exports = { claim, message, request, messageTimes };
