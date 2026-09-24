'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const admission = require('../src/services/rhizome/security/capabilityAdmissionService');

async function run() {
  const candidate = {
    nodeId: 'candidate', kind: 'TOOL', capabilities: ['verify'],
    providers: [{ providerId: 'provider-a', kind: 'tool' }], evidenceRequirements: ['smoke-check']
  };
  const verification = {
    kind: 'CAPABILITY_VERIFIED', evidenceId: 'smoke-17', verifierDigest: 'verifier-a',
    evidenceRefs: ['smoke-check']
  };
  const admitted = admission.admit(candidate, verification, {
    trustedProviderIds: ['provider-a'], trustedVerifierDigests: ['verifier-a']
  });
  assert.equal(admitted.state, 'ACTIVE');
  assert.equal(admitted.availability.status, 'AVAILABLE');
  assert.ok(admitted.provenance.includes('admission:smoke-17'));
  assert.throws(
    () => admission.admit(candidate, verification, { trustedProviderIds: ['provider-b'], trustedVerifierDigests: ['verifier-a'] }),
    (error) => error.code === 'RHIZOME_ADMISSION_PROVIDER_UNTRUSTED'
  );
  assert.throws(
    () => admission.admit(candidate, { ...verification, evidenceRefs: [] }, { trustedProviderIds: ['provider-a'], trustedVerifierDigests: ['verifier-a'] }),
    (error) => error.code === 'RHIZOME_ADMISSION_REQUIREMENTS_UNMET'
  );

  const session = await rhizome.composeRhizome('Keep untrusted bridges out of routes.', {
    nodes: [
      { nodeId: 'source', kind: 'AGENT', capabilities: ['search'], state: 'ACTIVE' },
      { nodeId: 'target', kind: 'TOOL', capabilities: ['verify'], state: 'ACTIVE' }
    ],
    edges: [{ edgeId: 'bridge', from: 'source', to: 'target', relation: 'ROUTES_TO' }],
    coordinationLoci: [{ locusId: 'root', holderNodeId: 'source', reason: 'local route test' }]
  });
  const need = { needId: 'verify-1', capability: 'verify' };
  const proof = {
    evidenceId: 'incident-17', kind: 'PROVEN_COMPROMISE',
    reason: 'Bridge produced a verified security violation.', verifierDigest: 'trusted-verifier'
  };

  await assert.rejects(
    () => rhizome.quarantineRoute(session.sessionId, { edgeIds: ['bridge'], evidence: proof }, { trustedVerifierDigests: [] }),
    (error) => error.code === 'RHIZOME_QUARANTINE_EVIDENCE_REQUIRED'
  );
  assert.equal((await rhizome.routeToCapability(session.sessionId, need)).selected, true);

  await rhizome.quarantineRoute(session.sessionId, { edgeIds: ['bridge'], evidence: proof }, { trustedVerifierDigests: ['trusted-verifier'] });
  const snapshot = await rhizome.graphSnapshot(session.sessionId);
  assert.equal(snapshot.edges[0].status, 'QUARANTINED');
  assert.equal(snapshot.edges[0].quarantine.evidenceId, 'incident-17');
  assert.equal((await rhizome.routeToCapability(session.sessionId, need)).verdict, 'unreachable');
}

run().then(() => console.log('Rhizome route quarantine checks: PASS')).catch((error) => {
  console.error('Rhizome security test failed:', error);
  process.exit(1);
});
