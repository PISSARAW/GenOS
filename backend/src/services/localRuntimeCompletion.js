'use strict';

const artifacts = require('./agents/workerArtifactContract');
const kinds = require('./agents/workerKindService');
const synthesis = require('./localRuntimeSynthesis');

function assertTestsPassed(proofs = []) {
  const failed = proofs.filter(proof => !testPassed(proof));
  if (!failed.length) return;
  throw Object.assign(new Error('Local worker test commands did not pass.'), {
    code: 'WORKER_TESTS_FAILED', tests: failed
  });
}

function testPassed(proof) {
  return proof?.executed === true && proof.exitCode === 0 && !proof.signal && !proof.timedOut;
}

function assertSuccess(report) {
  if (report.outcome === 'success') return;
  throw Object.assign(new Error('Local worker did not substantiate successful completion.'), {
    code: 'WORKER_OUTPUT_FAILED', report
  });
}

function buildReport(state, dossierText) {
  const model = String(state.mission.localModel || process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'local-model');
  const executedTests = (state.commandProofs || []).filter(testPassed);
  const provenance = { source: 'local-codex-runtime', model, workspaceRoot: state.workspaceRoot,
    agentName: state.agentName, methodContract: state.mission.methodContract || null,
    readFileHashes: state.fileHashes, executedTests };
  const kind = kinds.resolveWorkerKind(state.mission.workerKind, state.mission.role);
  const workerArtifact = state.mission.executionMode === 'worker'
    ? artifacts.buildWorkerArtifact(kind, dossierText, provenance)
    : artifacts.buildDossierArtifact(dossierText, provenance);
  if (!workerArtifact) throw new Error(`Local model did not return a valid '${kinds.kindDefinition(kind).artifact}' artifact.`);
  const parsed = synthesis.parseCompletionReply(dossierText);
  const outcome = completionOutcome(parsed, state.commandProofs);
  const report = { outcome, claims: synthesis.reportClaims(parsed, dossierText, state), workerArtifact,
    author: { name: state.agentName, meaning: state.nameMeaning, role: state.mission.role || 'Assistant IA de développement' } };
  synthesis.attachInfluence(report, parsed);
  require('./localCompletionEvidence').attachFields(report, parsed);
  return report;
}

function completionOutcome(parsed, proofs = []) {
  if (proofs.some(proof => !testPassed(proof))) return 'failed';
  return parsed.outcome === undefined ? 'success' : parsed.outcome;
}

function emit(state, report, emitEvent) {
  const snapshot = state.mission?.runtimeCapsule?.snapshotPath;
  emitEvent(state, { eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS',
    detail: 'Local runtime emitted its structured evidence report.', payload: report });
  const success = report.outcome === 'success';
  emitEvent(state, { eventType: success ? 'AGENT_COMPLETED' : 'AGENT_FAILED', action: 'COMPLETE',
    detail: success ? 'Local cognitive router completed.' : 'Local worker did not complete successfully.',
    status: success ? 'completed' : 'failed', payload: { ...(state.observedRoute || {}), evidenceReport: report,
      ...(snapshot ? { snapshot } : {}) } });
}

module.exports = { assertTestsPassed, assertSuccess, buildReport, emit };
