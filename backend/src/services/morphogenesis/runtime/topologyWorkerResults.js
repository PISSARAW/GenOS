'use strict';

function collectTopologyWorkerResults(workers, input = {}) {
  if (!Array.isArray(workers) || workers.length === 0) return [];
  const results = Array.isArray(input.workerResults) ? input.workerResults : workers;
  return workers.map((worker) => resultForWorker(worker, results));
}

function resultForWorker(worker, results) {
  const workerId = workerIdOf(worker);
  if (!workerId) throw workerResultsError('Topology workers must have stable worker IDs.');
  const result = results.find((candidate) => workerIdOf(candidate) === workerId);
  const report = result?.evidenceReport || result?.report;
  if (!result || report?.outcome !== 'success' || !hasTypedArtifact(report, worker)) {
    throw workerResultsError(`Topology worker '${workerId}' has no validated success artifact.`);
  }
  return { workerId, workerKind: worker.workerKind || result.workerKind || null, evidenceReport: report };
}

function workerIdOf(value) {
  return String(value?.workerId || value?.agentId || value?.id || '').trim();
}

function hasTypedArtifact(report, worker) {
  const artifact = report.workerArtifact;
  if (!artifact || typeof artifact.type !== 'string' || !artifact.content) return false;
  const expected = worker.workerArtifact || worker.artifactType;
  if (expected && artifact.type !== expected) return false;
  const refs = artifact.provenance?.sourceRefs || artifact.provenance?.evidenceRefs;
  return Array.isArray(refs) && refs.length > 0
    && refs.every((ref) => typeof ref === 'string' && ref.trim());
}

function workerResultsError(message) {
  return Object.assign(new Error(message), { code: 'TOPOLOGY_WORKER_RESULTS_REQUIRED' });
}

module.exports = { collectTopologyWorkerResults };
