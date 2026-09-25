'use strict';

const workerKinds = require('./agents/workerKindService');
const { buildWorkerArtifact } = require('./agents/workerArtifactContract');

function attachFullText(evidenceReport, result) {
  if (!evidenceReport || typeof evidenceReport !== 'object') return;
  const text = result && typeof result.text === 'string' ? result.text : '';
  if (text) evidenceReport.fullText = text;
}

function attachWorkerArtifact(evidenceReport, context) {
  if (!evidenceReport || typeof evidenceReport !== 'object') return;
  const mission = context.mission || {};
  const kind = workerKinds.resolveWorkerKind(mission.workerKind, mission.role);
  evidenceReport.workerArtifact = buildWorkerArtifact(kind, context.result?.text, {
    source: 'worker-inprocess-local', model: mission.localModel || 'local-model',
    workspaceRoot: mission.workspaceRoot || '', agentName: context.agentName || ''
  });
  if (!evidenceReport.workerArtifact) {
    throw Object.assign(new Error(`Local model did not return a valid '${workerKinds.kindDefinition(kind).artifact}' artifact.`), { code: 'INVALID_WORKER_ARTIFACT' });
  }
}

module.exports = { attachFullText, attachWorkerArtifact };
