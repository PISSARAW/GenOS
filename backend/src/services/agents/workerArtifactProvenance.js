'use strict';

function validationProvenance(artifact, worker) {
  const mission = worker.workerContract?.mission || {};
  const original = artifact?.provenance || {};
  const host = worker.proofProvenance;
  const proof = host ? {
    executedTests: [], codeVerification: null, writtenFileHashes: null,
    changedFileHashes: null, ...host
  } : {};
  return { ...original, methodContract: mission.methodContract || null, ...proof };
}

function retainWitness(context) {
  const { worker, artifact, report, provenance } = context;
  if (!worker.proofProvenance) return;
  artifact.provenance = provenance;
  if (worker.proofProvenance.executedTests.length) report.workerArtifact = artifact;
}

module.exports = { validationProvenance, retainWitness };
