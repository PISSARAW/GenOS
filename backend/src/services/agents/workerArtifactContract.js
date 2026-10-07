'use strict';

const { hasEvidenceItem } = require('../agentEvidence/evidenceHelpers');
const { REQUIRED_FIELDS, CONTENT_TEMPLATES, artifactInstruction } = require('./workerArtifactInstructions');
const { hasEvidenceReferences, provenanceReferences } = require('./workerEvidenceReferenceService');
const { kindArtifactIsInvalid, validateInspectedKindArtifact } = require('./workerArtifactKindRules');

function isSubstantiveReport(report) {
  if (!report || typeof report !== 'object') return false;
  if (Array.isArray(report.claims) && report.claims.length) return true;
  const artifact = report.workerArtifact;
  return Boolean(artifact && typeof artifact === 'object' && artifact.type && artifact.content);
}

function reportOf(dossier) {
  const events = [...(dossier.events || [])].reverse();
  let fallback = null;
  for (const event of events) {
    const report = event.evidenceReport || event.payload?.evidenceReport || event.payload?.report;
    if (!report || typeof report !== 'object') continue;
    if (isSubstantiveReport(report)) return report;
    if (!fallback) fallback = report;
  }
  return fallback || {};
}

function hasRequiredFields(content, required) {
  return required.every((field) => hasEvidenceItem(content[field]));
}

function claimsAreSubstantiated(content) {
  if (!Array.isArray(content.claims) || !content.claims.length) return false;
  return content.claims.every((claim) => typeof claim?.statement === 'string'
    && claim.statement.trim() && hasEvidenceReferences(claim.evidence));
}

function contentIsValid(type, content) {
  if (!hasRequiredFields(content, REQUIRED_FIELDS[type] || [])) return false;
  const validator = new Map([
    ['scout_observation', (value) => hasStructuredObservations(value.observations)],
    ['dossier', claimsAreSubstantiated],
    ['experiment_record', hasRecordedMeasurements],
    ['training_packet', hasValidatedTrainingPacket],
    ['creative_candidate', hasFalsifiableCandidate],
    ['synthesis_dossier', hasPreservedSynthesis]
  ]).get(type);
  if (validator && !validator(content)) return false;
  return specializedContentIsValid(type, content);
}

function hasStructuredObservations(items) {
  return Array.isArray(items) && items.length > 0 && items.every((item) =>
    isNonEmptyText(item?.observation)
    && hasEvidenceReferences(item.sourceRefs)
    && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1
    && Array.isArray(item.uncertainties) && item.uncertainties.every(isNonEmptyText));
}

function hasPreservedSynthesis(content) {
  if (!isNonEmptyText(content.synthesis) || !hasEvidenceReferences(content.sources)
    || !Array.isArray(content.disagreements)) return false;
  return content.disagreements.every((item) => isNonEmptyText(item?.claim)
    && Array.isArray(item.positions) && item.positions.length > 1
    && item.positions.every((position) => isNonEmptyText(position?.source)
      && isNonEmptyText(position?.position)));
}

function hasFalsifiableCandidate(content) {
  return isNonEmptyText(content.candidate)
    && Array.isArray(content.assumptions) && content.assumptions.length > 0
    && content.assumptions.every(isNonEmptyText)
    && isNonEmptyText(content.falsificationTest);
}

function hasValidatedTrainingPacket(content) {
  return Array.isArray(content.prerequisites) && content.prerequisites.length > 0
    && content.prerequisites.every(isNonEmptyText)
    && Array.isArray(content.steps) && content.steps.length > 0
    && content.steps.every(isNonEmptyText)
    && hasEvidenceReferences(content.evidence);
}

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasRecordedMeasurements(content) {
  return typeof content.hypothesis === 'string' && content.hypothesis.trim().length > 0
    && Array.isArray(content.protocol) && content.protocol.length > 0
    && content.protocol.every((step) => typeof step === 'string' && step.trim().length > 0)
    && Array.isArray(content.measurements) && content.measurements.length > 0
    && content.measurements.every((measurement) => hasRecordedMeasurementsCondition(measurement));
}

function specializedContentIsValid(type, content) {
  if (type === 'verification_report') return validVerificationContent(content);
  if (type === 'formal_certificate') return hasSolverReceipt(content.solverReceipt, content);
  if (type === 'clinical_report') return isNonDiagnosticClinicalReport(content);
  if (type === 'causal_dossier') return hasCausalChain(content.causalChain);
  return true;
}

function hasCausalChain(chain) {
  return Array.isArray(chain) && chain.length > 0 && chain.every((link) =>
    typeof link?.from === 'string' && link.from.trim()
    && typeof link?.to === 'string' && link.to.trim()
    && link.from !== link.to
    && typeof link?.relation === 'string' && link.relation.trim()
    && hasEvidenceReferences(link.evidence));
}

function validVerificationContent(content) {
  const verdict = String(content.verdict).toLowerCase();
  if (!['accept', 'reject', 'unresolved'].includes(verdict)
    || !hasEvidenceReferences(content.evidence || content.reproductionEvidence)
    || !isNonEmptyText(content.testedClaim) || !isNonEmptyText(content.verificationMethod)
    || !Array.isArray(content.reproductionSteps) || !content.reproductionSteps.length
    || !content.reproductionSteps.every(isNonEmptyText)) return false;
  return true;
}

function hasSolverReceipt(receipt, content) {
  return Boolean(isNonEmptyText(content.claim) && isNonEmptyText(content.solver)
    && receipt && typeof receipt.id === 'string' && receipt.id.trim()
    && receipt.claim === content.claim && receipt.solver === content.solver
    && receipt.result === content.result && hasEvidenceReferences(receipt.evidence));
}

function isNonDiagnosticClinicalReport(content) {
  const allowed = new Set(['caseScope', 'differentialConsiderations', 'uncertainty', 'safetyNote', 'evidence']);
  return content.caseScope === 'synthetic_educational'
    && Object.keys(content).every((key) => allowed.has(key))
    && !containsClinicalDirective(content);
}

function containsClinicalDirective(content) {
  const text = collectText(content).join(' ').toLowerCase();
  return containsClinicalDirectiveCondition(text)
    || /\brecommend(?:s|ed)?\s+(?:a\s+)?(?:treatment|medication|therapy)\b/.test(text);
}

function collectText(value) {
  const pending = [value];
  const text = [];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') text.push(current);
    else if (Array.isArray(current)) pending.push(...current);
    else if (current && typeof current === 'object') pending.push(...Object.values(current));
  }
  return text;
}

function hasProvenance(artifact) {
  return hasEvidenceReferences(provenanceReferences(artifact));
}

function artifactError(workerId, expected) {
  const error = new Error(`Worker '${workerId}' did not provide a valid '${expected}' artifact with provenance.`);
  error.code = 'INVALID_WORKER_ARTIFACT';
  error.workerId = workerId;
  error.expectedArtifact = expected;
  return error;
}

function artifactEvidenceRefs(provenance) {
  return provenance?.sourceRefs || provenance?.evidenceRefs || [];
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
  if (reply && typeof reply === 'object' && !Array.isArray(reply)) return reply;
  const text = String(reply || '').trim();
  const tagged = text.match(/^\[ARTIFACT:\s*[^\]]+\]([\s\S]*?)\[\/ARTIFACT\]$/i);
  const source = (tagged ? tagged[1] : text).trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced ? fenced[1] : source).replace(/^json\s*(?=\{)/i, '');
  try { return JSON.parse(candidate); } catch (_) { return null; }
}

function buildWorkerArtifact(kind, reply, provenance) {
  return inspectWorkerArtifact(kind, reply, provenance).artifact;
}

function inspectWorkerArtifact(kind, reply, provenance) {
  const expected = require('./workerKindService').kindDefinition(kind).artifact;
  const methodContract = provenance?.methodContract || null;
  const artifactProvenance = { ...(provenance || {}) };
  delete artifactProvenance.methodContract;
  const parsed = parseArtifactReply(reply);
  const issues = [];
  if (!parsed) issues.push(reply ? 'response.invalid_json' : 'response.absent');
  if (parsed && !Array.isArray(parsed.claims)) issues.push('claims.missing_or_invalid');
  const input = { parsed, expected, kind, provenance: artifactProvenance, issues };
  const result = expected === 'dossier' ? inspectDossier(input) : inspectSpecialized(input);
  return validateInspectedKindArtifact(validateMethodEvidence(result, parsed, methodContract), kind, expected);
}

function validateMethodEvidence(result, parsed, methodContract) {
  const required = Array.isArray(methodContract?.requiredEvidence) ? methodContract.requiredEvidence : [];
  const missing = required.filter((path) => !hasEvidenceItem(valueAtPath(parsed, path)));
  if (!missing.length) return result;
  return {
    artifact: null,
    issues: [...result.issues, ...missing.map((path) => `methodEvidence.missing:${path}`)]
  };
}

function valueAtPath(value, path) {
  return String(path || '').split('.').filter(Boolean).reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[key];
  }, value);
}

function inspectDossier(input) {
  const { parsed, expected, kind, provenance, issues } = input;
  if (!parsed || issues.length) return { artifact: null, issues };
  const content = inspectDossierContent(parsed, kind);
  if (!contentIsValid(expected, content)) issues.push('content.claims.invalid');
  const sourceRefs = [...new Set(content.claims.flatMap((claim) => claim.evidence))];
  return { artifact: issues.length ? null : { type: expected, content, provenance: { ...(provenance || {}), sourceRefs } }, issues };
}

function inspectSpecialized(input) {
  const { parsed, expected, provenance, issues } = input;
  if (!parsed) return { artifact: null, issues };
  const artifact = parsed.workerArtifact;
  if (!artifact || typeof artifact !== 'object') issues.push('workerArtifact.missing');
  else if (artifact.type !== expected) issues.push('workerArtifact.type.mismatch');
  const sourceRefs = provenanceReferences(artifact);
  if (!hasEvidenceReferences(sourceRefs)) issues.push('workerArtifact.provenance.references.invalid');
  const content = artifact && artifact.content;
  inspectRequiredContent(expected, content, issues);
  if (issues.length) return { artifact: null, issues };
  return { artifact: { type: expected, content, provenance: { ...(provenance || {}), sourceRefs } }, issues };
}

function inspectRequiredContent(expected, content, issues) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    issues.push('workerArtifact.content.missing_or_invalid');
    return;
  }
  for (const field of REQUIRED_FIELDS[expected] || []) {
    if (!hasEvidenceItem(content[field])) issues.push(`workerArtifact.content.${field}.missing_or_invalid`);
  }
  if (contentIsValid(expected, content)) return;
  appendSpecializedContentIssue(expected, content, issues);
}

function appendSpecializedContentIssue(expected, content, issues) {
  const issue = specializedContentIssue(expected, content);
  if (issue) issues.push(issue);
}

function specializedContentIssue(expected, content) {
  const issues = {
    clinical_report: !isNonDiagnosticClinicalReport(content) && 'caseScope.must_be_synthetic_educational_and_non_diagnostic',
    formal_certificate: !hasSolverReceipt(content.solverReceipt, content) && 'solverReceipt.invalid',
    verification_report: verificationIssue(content)
  };
  return issues[expected] ? `workerArtifact.content.${issues[expected]}` : null;
}

function verificationIssue(content) {
  if (!validVerdict(content.verdict)) return 'verdict.invalid';
  return validVerificationContent(content) ? null : 'verification_details.invalid';
}

function validVerdict(verdict) {
  return ['accept', 'reject', 'unresolved'].includes(String(verdict).toLowerCase());
}

function validateWorkerArtifact(dossier, worker) {
  const required = worker.workerContract?.evidence?.requiredArtifacts || [];
  if (!required.length) throw Object.assign(new Error('Worker contract declares no required artifacts.'), { code: 'WORKER_CONTRACT_INVALID_NO_ARTIFACTS' });
  const report = reportOf(dossier);
  const artifact = report.workerArtifact;
  const kind = worker.workerContract?.identity?.workerKind;
  for (const expected of required) {
    const fields = REQUIRED_FIELDS[expected];
    if (validateWorkerArtifactCondition(artifact, expected, fields) || kindArtifactIsInvalid({
        kind, type: expected, content: artifact.content, contract: worker.workerContract
      })) {
      throw artifactError(worker.agentId, expected);
    }
  }
  return true;
}

module.exports = { REQUIRED_FIELDS, CONTENT_TEMPLATES, artifactInstruction, validateWorkerArtifact, buildDossierArtifact, buildWorkerArtifact, inspectWorkerArtifact };

function containsClinicalDirectiveCondition(text) {
  return /\b(?:you|the patient|patient|they)\s+(?:have|has|are|is diagnosed with)\b/.test(text)
    || /\bdiagnosis\s*:\s*\S/.test(text)
    || /\b(?:prescribe|take|start|stop|increase|decrease)\s+(?:the\s+)?(?:medication|dose|treatment|therapy)\b/.test(text);
}

function hasRecordedMeasurementsCondition(measurement) {
  return typeof measurement?.metric === 'string'
      && measurement.metric.trim().length > 0
      && Number.isFinite(measurement.value)
      && typeof measurement.unit === 'string' && measurement.unit.trim().length > 0
      && hasEvidenceReferences(measurement.evidence);
}

function validateWorkerArtifactCondition(artifact, expected, fields) {
  return !artifact || artifact.type !== expected || !fields
      || !artifact.content || !contentIsValid(expected, artifact.content)
      || !hasProvenance(artifact);
}

function inspectDossierContent(parsed, kind) {
  return {
    claims: parsed.claims,
    ...(kind === 'recovery_worker' ? { recoveryReceipt: parsed.recoveryReceipt } : {}),
    ...(kind === 'liaison_worker' ? { handoff: parsed.handoff } : {}),
    ...(kind === 'resident_daemon' ? { territoryReport: parsed.territoryReport } : {}),
    ...(kind === 'bounded_worker' ? { scopeCompletion: parsed.scopeCompletion } : {}),
    ...(kind === 'adaptive_worker' ? { strategyTrace: parsed.strategyTrace } : {}),
    ...(kind === 'specialist' ? { specialtyAssessment: parsed.specialtyAssessment } : {}),
    ...(kind === 'symbiotic_worker' ? { hostContribution: parsed.hostContribution } : {}),
    ...(kind === 'sub_orchestrator' ? { childSummaries: parsed.childSummaries } : {})
  };
}
