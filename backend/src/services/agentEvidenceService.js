/**
 * Worker evidence bookkeeping: per-round dossiers, scoring, and the synthesis
 * prompt the orchestrator consumes after its delegated workers go terminal.
 *
 * Implementation lives in ./agentEvidence/* so each unit stays within the
 * repository code-quality limits. The public surface below is unchanged.
 */
const {
  MAX_WORKER_DOSSIER_EVENTS,
  recordWorkerEvidence,
  workerEvidenceDossiers,
  buildWorkerSynthesisPrompt,
  clusterWorkerDossiers,
  dossierDigest
} = require('./agentEvidence/workerEvidence');
const {
  validateWorkerDossiers,
  validateWorkerDossierCoherence,
  validateDossierInfluence
} = require('./agentEvidence/dossierValidation');
const { hasDecisionEvidence, decisionEvidenceFailure } = require('./agentEvidence/decisionEvidence');
const { evidenceScore } = require('./agentEvidence/evidenceScoring');
const { extractEvidenceReport, boundedScore } = require('./agentEvidence/evidenceHelpers');

module.exports = {
  MAX_WORKER_DOSSIER_EVENTS,
  extractEvidenceReport,
  hasDecisionEvidence,
  decisionEvidenceFailure,
  validateWorkerDossierCoherence,
  recordWorkerEvidence,
  workerEvidenceDossiers,
  validateWorkerDossiers,
  validateDossierInfluence,
  buildWorkerSynthesisPrompt,
  clusterWorkerDossiers,
  dossierDigest,
  boundedScore,
  evidenceScore
};
