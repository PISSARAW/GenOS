'use strict';

const { hasEvidenceItem } = require('../agentEvidence/evidenceHelpers');

const REQUIRED_FIELDS = Object.freeze({
  scout_observation: ['observations'],
  dossier: ['claims'],
  verification_report: ['verdict', 'evidence'],
  experiment_record: ['hypothesis', 'protocol', 'measurements'],
  formal_certificate: ['claim', 'solver', 'result', 'solverReceipt'],
  synthesis_dossier: ['synthesis', 'sources'],
  creative_candidate: ['candidate', 'assumptions', 'falsificationTest'],
  clinical_report: ['caseScope', 'differentialConsiderations', 'uncertainty', 'safetyNote'],
  causal_dossier: ['causalChain', 'evidence'],
  training_packet: ['prerequisites', 'steps', 'evidence']
});

const CONTENT_TEMPLATES = Object.freeze({
  scout_observation: { observations: ['<observation>'] },
  dossier: { claims: [{ statement: '<claim>', evidence: ['<source-ref>'] }] },
  verification_report: { verdict: 'reject', evidence: ['<reproduction-ref>'] },
  experiment_record: { hypothesis: '<hypothesis>', protocol: ['<step>'], measurements: ['<measurement>'] },
  formal_certificate: { claim: '<exact-claim>', solver: '<solver-name>', result: '<solver-result>', solverReceipt: { id: '<receipt-id>', evidence: ['<receipt-ref>'] } },
  synthesis_dossier: { synthesis: '<synthesis>', sources: ['<source-ref>'] },
  creative_candidate: { candidate: '<candidate>', assumptions: ['<assumption>'], falsificationTest: '<test>' },
  clinical_report: { caseScope: 'synthetic_educational', differentialConsiderations: ['<general-consideration>'], uncertainty: '<uncertainty>', safetyNote: 'No individual diagnosis or treatment advice.' },
  causal_dossier: { causalChain: ['<event-ref>: <causal-link>'], evidence: ['<receipt-ref>'] },
  training_packet: { prerequisites: ['<prerequisite>'], steps: ['<step>'], evidence: ['<source-ref>'] }
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
  return specializedContentIsValid(type, content);
}

function specializedContentIsValid(type, content) {
  if (type === 'verification_report') return validVerificationContent(content);
  if (type === 'formal_certificate') return hasSolverReceipt(content.solverReceipt);
  if (type === 'clinical_report') return isNonDiagnosticClinicalReport(content);
  return true;
}

function validVerificationContent(content) {
  const verdict = String(content.verdict).toLowerCase();
  return ['accept', 'reject', 'unresolved'].includes(verdict)
    && hasEvidenceItem(content.evidence || content.reproductionEvidence);
}

function hasSolverReceipt(receipt) {
  return Boolean(receipt && typeof receipt.id === 'string' && receipt.id.trim()
    && Array.isArray(receipt.evidence) && receipt.evidence.some(hasEvidenceItem));
}

function isNonDiagnosticClinicalReport(content) {
  return content.caseScope === 'synthetic_educational'
    && !Object.hasOwn(content, 'diagnoses')
    && !Object.hasOwn(content, 'treatment')
    && !Object.hasOwn(content, 'patientSpecificAdvice');
}

function hasProvenance(artifact) {
  return hasEvidenceItem(artifact.provenance) || hasEvidenceItem(artifact.evidenceRefs);
}

function artifactInstruction(contract) {
  const required = contract?.evidence?.requiredArtifacts || [];
  if (!required.length) return '';
  const rhizome = rhizomeArtifactInstruction(contract, required);
  if (rhizome) return rhizome;
  const template = required.map((type) => ({ type, content: CONTENT_TEMPLATES[type] }));
  if (required.every((type) => type === 'dossier')) {
    return `Return one JSON object matching this contract: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims })}. The top-level claims form the dossier; cite source references in evidence.`;
  }
  const artifact = template[0];
  return `Return one JSON object matching this contract: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims, workerArtifact: { ...artifact, provenance: { sourceRefs: ['<source-ref>'] } } })}. Keep the artifact under workerArtifact; its type must be ${artifact.type}. Do not put type or content at the root. Include source references in claims.evidence and workerArtifact.provenance.`;
}

function rhizomeArtifactInstruction(contract, required) {
  const objective = contract?.mission?.objective || '';
  if (!/Mission Rhizome|Rhizome discovery branch/i.test(objective)) return '';
  const output = rhizomeOutputTemplate(required);
  return `This is a Rhizome capability-mapping branch. Return one JSON object matching this schema: ${JSON.stringify(output)}. Keep the complete capability map at the top level, fill every listed field, and put the required typed worker artifact under workerArtifact. Treat unknownDependencies as hypotheses, cite only real references or label observations, and never invent evidence.`;
}

function rhizomeOutputTemplate(required) {
  const output = {
    outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims,
    answer: '<branch answer>', capabilities: [], unknownDependencies: [],
    interfaces: [], assumptions: [], evidence: []
  };
  const artifactType = required[0];
  if (artifactType && artifactType !== 'dossier') {
    output.workerArtifact = {
      type: artifactType,
      content: CONTENT_TEMPLATES[artifactType],
      provenance: { sourceRefs: ['<source-ref>'] }
    };
  }
  return output;
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
  const input = { parsed, expected, provenance: artifactProvenance, issues };
  const result = expected === 'dossier' ? inspectDossier(input) : inspectSpecialized(input);
  return validateMethodEvidence(result, parsed, methodContract);
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
  const { parsed, expected, provenance, issues } = input;
  if (!parsed || issues.length) return { artifact: null, issues };
  const content = { claims: parsed.claims };
  if (!contentIsValid(expected, content)) issues.push('content.claims.invalid');
  return { artifact: issues.length ? null : { type: expected, content, provenance: provenance || {} }, issues };
}

function inspectSpecialized(input) {
  const { parsed, expected, provenance, issues } = input;
  if (!parsed) return { artifact: null, issues };
  const artifact = parsed.workerArtifact;
  if (!artifact || typeof artifact !== 'object') issues.push('workerArtifact.missing');
  else if (artifact.type !== expected) issues.push('workerArtifact.type.mismatch');
  const content = artifact && artifact.content;
  inspectRequiredContent(expected, content, issues);
  if (issues.length) return { artifact: null, issues };
  return { artifact: { type: expected, content, provenance: provenance || {} }, issues };
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
    formal_certificate: !hasSolverReceipt(content.solverReceipt) && 'solverReceipt.invalid',
    verification_report: !validVerdict(content.verdict) && 'verdict.invalid'
  };
  return issues[expected] ? `workerArtifact.content.${issues[expected]}` : null;
}

function validVerdict(verdict) {
  return ['accept', 'reject', 'unresolved'].includes(String(verdict).toLowerCase());
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

module.exports = { REQUIRED_FIELDS, CONTENT_TEMPLATES, artifactInstruction, validateWorkerArtifact, buildDossierArtifact, buildWorkerArtifact, inspectWorkerArtifact };
