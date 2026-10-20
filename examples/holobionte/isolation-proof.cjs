'use strict';

// Démonstrateur de contrat uniquement. Un adaptateur de production doit remplacer
// cette attestation par les références émises par sa sandbox ou son conteneur réel.
function exampleIsolationProof(adapterProvenance, isolationId) {
  if (!adapterProvenance?.proofHash) {
    throw Object.assign(new Error('Trial adapter provenance is required.'),
      { code: 'HOLOBIONT_ISOLATION_UNVERIFIED' });
  }
  return { schema: 'genos.holobiont-isolation-proof/v1', status: 'VERIFIED', isolationId,
    mechanism: 'example-adapter-attestation', adapterProofHash: adapterProvenance.proofHash,
    observedAt: new Date().toISOString(), evidenceRefs: [`example-isolation:${isolationId}`],
    boundaries: { process: 'ISOLATED', workspace: 'EPHEMERAL', network: 'DENIED' } };
}

function verifiedEvidence(output, evidenceRefs) {
  return [...evidenceRefs, ...(output.isolationProof?.evidenceRefs || [])];
}

module.exports = { exampleIsolationProof, verifiedEvidence };
