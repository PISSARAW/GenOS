'use strict';

const IMPLEMENTATION_ID = 'artifact-integrity-v1';
const REQUIREMENT = 'artifact-integrity';

function registerBuiltInVerifiers(registry) {
  const trust = require('./verifierTrustRegistry');
  trust.registerVerifier({ id: IMPLEMENTATION_ID, type: 'artifact',
    digest: trust.computeVerifierDigest(IMPLEMENTATION_ID, '1.0'),
    description: 'Confirms artifact bytes match the declared SHA-256; does not assess semantic correctness.' });
  registry.registerVerifierImplementation({ id: IMPLEMENTATION_ID,
    requirements: [REQUIREMENT], verify: verifyArtifactIntegrity });
}

function verifyArtifactIntegrity(input) {
  const matches = input.evidence?.artifactHash === input.artifactHash;
  return { verified: matches, evidenceClass: 'artifact_integrity_only',
    reason: matches ? null : 'declared-artifact-hash-mismatch' };
}

module.exports = { IMPLEMENTATION_ID, REQUIREMENT, registerBuiltInVerifiers, verifyArtifactIntegrity };
