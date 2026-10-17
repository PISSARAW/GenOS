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
  return {
    workerId,
    ...workerMetadata(worker, result, report),
    evidenceReport: report
  };
}

function workerMetadata(worker, result, report) {
  return {
    workerKind: firstValue(worker.workerKind, result.workerKind),
    role: firstValue(worker.role, result.role, report.role),
    chamber: firstValue(worker.chamber, result.chamber, report.chamber),
    worldNumber: firstValue(worker.worldNumber, result.worldNumber, report.worldNumber)
  };
}

function firstValue(...values) {
  const value = values.find((entry) => entry !== undefined && entry !== null && entry !== '');
  return value === undefined ? null : value;
}

function workerIdOf(value) {
  return String(value?.workerId || value?.agentId || value?.id || '').trim();
}

function hasTypedArtifact(report, worker) {
  const artifact = report.workerArtifact;
  if (hasTypedArtifactCondition(artifact)) return false;
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

function hasTypedArtifactCondition(artifact) {
  return !artifact || typeof artifact.type !== 'string' || !artifact.content;
}
