'use strict';

const workerKinds = require('./agents/workerKindService');
const { inspectWorkerArtifact } = require('./agents/workerArtifactContract');

const MAX_MODEL_OUTPUT_CHARS = 8192;
const MAX_FAILURE_EXCERPT_CHARS = 2048;

function attachFullText(evidenceReport, result) {
  if (!evidenceReport || typeof evidenceReport !== 'object') return;
  const text = result && typeof result.text === 'string' ? result.text : '';
  if (text) {
    evidenceReport.fullText = text.slice(0, MAX_MODEL_OUTPUT_CHARS);
    evidenceReport.fullTextTruncated = text.length > MAX_MODEL_OUTPUT_CHARS;
  }
}

function outputExcerpt(report) {
  const text = String(report?.fullText || '');
  return text.slice(0, MAX_FAILURE_EXCERPT_CHARS);
}

function attachWorkerArtifact(evidenceReport, context) {
  if (!evidenceReport || typeof evidenceReport !== 'object') return;
  const mission = context.mission || {};
  const kind = workerKinds.resolveWorkerKind(mission.workerKind, mission.role);
  const inspected = inspectWorkerArtifact(kind, evidenceReport, {
    source: 'worker-inprocess-local', model: mission.localModel || 'local-model',
    workspaceRoot: mission.workspaceRoot || '', agentName: context.agentName || ''
  });
  evidenceReport.workerArtifact = inspected.artifact;
  if (!inspected.artifact) {
    const expected = workerKinds.kindDefinition(kind).artifact;
    const diagnostic = { expected, issues: inspected.issues, outputExcerpt: outputExcerpt(evidenceReport) };
    throw Object.assign(new Error(`Local model artifact rejected for '${expected}': ${inspected.issues.join(', ') || 'unknown validation error'}.`), {
      code: 'INVALID_WORKER_ARTIFACT', workerArtifactDiagnostics: diagnostic
    });
  }
}

module.exports = { attachFullText, attachWorkerArtifact };
