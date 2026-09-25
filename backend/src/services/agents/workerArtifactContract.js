'use strict';

const { hasEvidenceItem } = require('../agentEvidence/evidenceHelpers');

const REQUIRED_FIELDS = Object.freeze({
  scout_observation: ['observations'],
  dossier: ['claims'],
  verification_report: ['verdict', 'evidence'],
  experiment_record: ['hypothesis', 'protocol', 'measurements'],
  formal_certificate: ['claim', 'solver', 'result'],
  synthesis_dossier: ['synthesis', 'sources'],
  creative_candidate: ['candidate'],
  clinical_report: ['diagnoses', 'uncertainty'],
  causal_dossier: ['causalChain', 'evidence'],
  training_packet: ['prerequisites', 'steps', 'evidence']
});

function reportOf(dossier) {
  const events = [...(dossier.events || [])].reverse();
  for (const event of events) {
    const report = event.evidenceReport || event.payload?.evidenceReport || event.payload?.report;
    if (report && typeof report === 'object') return report;
  }
  return {};
}

function hasRequiredFields(content, required) {
  return required.every((field) => hasEvidenceItem(content[field]));
}

function claimsAreSubstantiated(content) {
  if (!Array.isArray(content.claims) || !content.claims.length) return false;
  return content.claims.every((claim) => typeof claim?.statement === 'string'
    && claim.statement.trim() && hasEvidenceItem(claim.evidence));
}

function contentIsValid(type, content) {
  if (!hasRequiredFields(content, REQUIRED_FIELDS[type] || [])) return false;
  if (type === 'dossier' && !claimsAreSubstantiated(content)) return false;
  if (type === 'verification_report') {
    const verdict = String(content.verdict).toLowerCase();
    return ['accept', 'reject', 'unresolved'].includes(verdict)
      && hasEvidenceItem(content.evidence || content.reproductionEvidence);
  }
  return true;
}

function hasProvenance(artifact) {
  return hasEvidenceItem(artifact.provenance) || hasEvidenceItem(artifact.evidenceRefs);
}

function artifactInstruction(contract) {
  const required = contract?.evidence?.requiredArtifacts || [];
  if (!required.length) return '';
  return `Return evidenceReport.workerArtifact as {type, content, provenance}; type must be ${required.join(' or ')}. Required content fields: ${required.map((type) => `${type}=[${(REQUIRED_FIELDS[type] || []).join(', ')}]`).join('; ')}. Provenance must contain source references.`;
}

function artifactError(workerId, expected) {
  const error = new Error(`Worker '${workerId}' did not provide a valid '${expected}' artifact with provenance.`);
  error.code = 'INVALID_WORKER_ARTIFACT';
  error.workerId = workerId;
  error.expectedArtifact = expected;
  return error;
}

function artifactEvidenceRefs(provenance) {
  const refs = [provenance && provenance.model, provenance && provenance.workspaceRoot];
  return refs.filter((ref) => typeof ref === 'string' && ref.trim());
}

function buildDossierArtifact(reply, provenance) {
  const statement = String(reply || '').slice(0, 8000);
  const source = (provenance && provenance) || {};
  return {
    type: 'dossier',
    content: { claims: [{ statement, evidence: artifactEvidenceRefs(source) }] },
    provenance: source
  };
}

function parseArtifactReply(reply) {
  const text = String(reply || '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate); } catch (_) { return null; }
}

function buildWorkerArtifact(kind, reply, provenance) {
  const expected = require('./workerKindService').kindDefinition(kind).artifact;
  if (expected === 'dossier') return buildDossierArtifact(reply, provenance);
  const parsed = parseArtifactReply(reply);
  if (!parsed || parsed.type !== expected || !parsed.content || typeof parsed.content !== 'object') return null;
  if (!contentIsValid(expected, parsed.content)) return null;
  return { type: expected, content: parsed.content, provenance: provenance || {} };
}

function validateWorkerArtifact(dossier, worker) {
  const required = worker.workerContract?.evidence?.requiredArtifacts || [];
  if (!required.length) return true;
  const report = reportOf(dossier);
  const artifact = report.workerArtifact;
  for (const expected of required) {
    const fields = REQUIRED_FIELDS[expected];
    if (!artifact || artifact.type !== expected || !fields
      || !artifact.content || !contentIsValid(expected, artifact.content)
      || !hasProvenance(artifact)) {
      throw artifactError(worker.agentId, expected);
    }
  }
  return true;
}

module.exports = { REQUIRED_FIELDS, artifactInstruction, validateWorkerArtifact, buildDossierArtifact, buildWorkerArtifact };
