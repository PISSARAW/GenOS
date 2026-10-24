'use strict';

const workerKinds = require('./agents/workerKindService');
const { inspectWorkerArtifact } = require('./agents/workerArtifactContract');
const { diagnosticMatrixIsValid } = require('./agents/diagnosticMatrixContract');

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
  const source = context.codeWorker ? evidenceReport : rawReply(evidenceReport);
  const inspected = inspectWorkerArtifact(kind, source,
    artifactProvenance(mission, context, evidenceReport));
  if (context.codeWorker !== true && requiresDiagnosticMatrix(mission)
    && !diagnosticMatrixIsValid(inspected.artifact?.content)) {
    inspected.issues.push('diagnosticMatrix.invalid');
    inspected.artifact = null;
  }
  evidenceReport.workerArtifact = inspected.artifact;
  if (!inspected.artifact) throw invalidArtifactError(kind, inspected.issues, evidenceReport);
  evidenceReport.claims = inspected.artifact.content.claims || evidenceReport.claims;
}

function requiresDiagnosticMatrix(mission) {
  return /artifact=diagnostic_matrix/i.test(mission.prompt || '');
}

function rawReply(report) { return report.fullText || report; }

function trustedCodeEvidenceRefs(report, codeWorker, proposal) {
  if (!codeWorker) return [];
  const claims = Array.isArray(report?.claims) ? report.claims : [];
  const refs = claims.flatMap((claim) => claim.evidence || [])
    .concat(report?.scopeCompletion?.completedRefs || []);
  const trusted = refs.filter((ref) => /^genos:\/\/code-(?:file|test)\/[a-f0-9]{64}$/.test(String(ref)));
  const receiptHash = proposal?.testExecutionReceipt?.receiptHash;
  if (typeof receiptHash === 'string' && /^[a-f0-9]{64}$/.test(receiptHash)) {
    trusted.push(`genos://code-test-execution/${receiptHash}`);
  }
  return trusted;
}

function artifactProvenance(mission, context, evidenceReport) {
  return {
    source: 'worker-inprocess-local', model: mission.localModel || 'local-model',
    workspaceRoot: mission.workspaceRoot || '', agentName: context.agentName || '',
    methodContract: mission.methodContract || null,
    readFileHashes: mission.readOnlyWorkspaceEvidence === true ? mission.readFileHashes || {} : {},
    allowedEvidenceRefs: [...new Set(['mission', ...(mission.allowedEvidenceRefs || mission.evidenceRefs || []),
      ...trustedCodeEvidenceRefs(evidenceReport, context.codeWorker, context.proposal)])]
  };
}

function invalidArtifactError(kind, issues, report) {
  const expected = workerKinds.kindDefinition(kind).artifact;
  const diagnostic = { expected, issues, outputExcerpt: outputExcerpt(report) };
  return Object.assign(new Error(`Local model artifact rejected for '${expected}': ${issues.join(', ') || 'unknown validation error'}.`), {
    code: 'INVALID_WORKER_ARTIFACT', workerArtifactDiagnostics: diagnostic
  });
}

module.exports = { attachFullText, attachWorkerArtifact };
