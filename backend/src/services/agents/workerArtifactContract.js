'use strict';

const { hasEvidenceItem } = require('../agentEvidence/evidenceHelpers');
const { hasEvidenceReferences, provenanceReferences } = require('./workerEvidenceReferenceService');

const REQUIRED_FIELDS = Object.freeze({
  scout_observation: ['observations'],
  dossier: ['claims'],
  verification_report: ['testedClaim', 'verificationMethod', 'verdict', 'reproductionSteps', 'evidence'],
  experiment_record: ['hypothesis', 'protocol', 'measurements'],
  formal_certificate: ['claim', 'solver', 'result', 'solverReceipt'],
  synthesis_dossier: ['synthesis', 'sources'],
  creative_candidate: ['candidate', 'assumptions', 'falsificationTest'],
  clinical_report: ['caseScope', 'differentialConsiderations', 'uncertainty', 'safetyNote'],
  causal_dossier: ['causalChain', 'evidence'],
  training_packet: ['prerequisites', 'steps', 'evidence']
});

const CONTENT_TEMPLATES = Object.freeze({
  scout_observation: { observations: [{ observation: '<observation>', sourceRefs: ['<source-ref>'], confidence: 0.5, uncertainties: [] }] },
  dossier: { claims: [{ statement: '<claim>', evidence: ['<source-ref>'] }] },
  verification_report: { testedClaim: '<claim>', verificationMethod: '<method>', verdict: 'reject', reproductionSteps: ['<step>'], evidence: ['<reproduction-ref>'] },
  experiment_record: { hypothesis: '<hypothesis>', protocol: ['<step>'], measurements: [{ metric: '<metric>', value: 0, unit: '<unit>', evidence: ['<measurement-ref>'] }] },
  formal_certificate: { claim: '<exact-claim>', solver: '<solver-name>', result: '<solver-result>', solverReceipt: { id: '<receipt-id>', claim: '<exact-claim>', solver: '<solver-name>', result: '<solver-result>', evidence: ['<receipt-ref>'] } },
  synthesis_dossier: { synthesis: '<synthesis>', sources: ['<source-ref>'], disagreements: [] },
  creative_candidate: { candidate: '<candidate>', assumptions: ['<assumption>'], falsificationTest: '<test>' },
  clinical_report: { caseScope: 'synthetic_educational', differentialConsiderations: ['<general-consideration>'], uncertainty: '<uncertainty>', safetyNote: 'No individual diagnosis or treatment advice.' },
  causal_dossier: { causalChain: [{ from: '<event-ref>', to: '<event-ref>', relation: '<causal-link>', evidence: ['<receipt-ref>'] }], evidence: ['<receipt-ref>'] },
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
    && claim.statement.trim() && hasEvidenceReferences(claim.evidence));
}

function contentIsValid(type, content) {
  if (!hasRequiredFields(content, REQUIRED_FIELDS[type] || [])) return false;
  if (type === 'scout_observation' && !hasStructuredObservations(content.observations)) return false;
  if (type === 'dossier' && !claimsAreSubstantiated(content)) return false;
  if (type === 'experiment_record' && !hasRecordedMeasurements(content)) return false;
  if (type === 'training_packet' && !hasValidatedTrainingPacket(content)) return false;
  if (type === 'creative_candidate' && !hasFalsifiableCandidate(content)) return false;
  if (type === 'synthesis_dossier' && !hasPreservedSynthesis(content)) return false;
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

function hasCounterexamples(items) {
  return Array.isArray(items) && items.length > 0 && items.every((item) =>
    isNonEmptyText(item?.claim) && isNonEmptyText(item?.attack)
    && Array.isArray(item.reproductionSteps) && item.reproductionSteps.length > 0
    && item.reproductionSteps.every(isNonEmptyText)
    && hasEvidenceReferences(item.evidence));
}

function hasRecoveryReceipt(receipt) {
  return Boolean(isNonEmptyText(receipt?.action)
    && isNonEmptyText(receipt?.restoredState)
    && isNonEmptyText(receipt?.receiptId)
    && hasEvidenceReferences(receipt?.evidence));
}

function hasBoundedHandoff(handoff) {
  return Boolean(isNonEmptyText(handoff?.sourceGroup)
    && isNonEmptyText(handoff?.targetGroup)
    && handoff.sourceGroup !== handoff.targetGroup
    && hasEvidenceReferences(handoff?.deliveredRefs));
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
    && content.measurements.every((measurement) => typeof measurement?.metric === 'string'
      && measurement.metric.trim().length > 0
      && Number.isFinite(measurement.value)
      && typeof measurement.unit === 'string' && measurement.unit.trim().length > 0
      && hasEvidenceReferences(measurement.evidence));
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
  return /\b(?:you|the patient|patient|they)\s+(?:have|has|are|is diagnosed with)\b/.test(text)
    || /\bdiagnosis\s*:\s*\S/.test(text)
    || /\b(?:prescribe|take|start|stop|increase|decrease)\s+(?:the\s+)?(?:medication|dose|treatment|therapy)\b/.test(text)
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

function artifactInstruction(contract) {
  const required = contract?.evidence?.requiredArtifacts || [];
  if (!required.length) return '';
  if (contract.identity?.workerKind === 'recovery_worker') return recoveryInstruction();
  if (contract.identity?.workerKind === 'liaison_worker') return liaisonInstruction();
  const rhizome = rhizomeArtifactInstruction(contract, required);
  if (rhizome) return rhizome;
  const template = required.map((type) => ({ type, content: templateForWorker(contract, type) }));
  if (required.every((type) => type === 'dossier')) {
    return `Return one JSON object matching this contract: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims })}. The top-level claims form the dossier; cite source references in evidence.`;
  }
  const artifact = template[0];
  return `Return one JSON object matching this contract: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims, workerArtifact: { ...artifact, provenance: { sourceRefs: ['<source-ref>'] } } })}. Keep the artifact under workerArtifact; its type must be ${artifact.type}. Do not put type or content at the root. Include source references in claims.evidence and workerArtifact.provenance.`;
}

function recoveryInstruction() {
  const output = { outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims,
    recoveryReceipt: { action: '<leased-action>', restoredState: '<restored-state>', receiptId: '<receipt-id>', evidence: ['<receipt-ref>'] } };
  return `Return a dossier plus the executed recovery receipt. Do not claim restoration without a receipt. Schema: ${JSON.stringify(output)}`;
}

function liaisonInstruction() {
  const output = { outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims,
    handoff: { sourceGroup: '<source-group>', targetGroup: '<target-group>', deliveredRefs: ['<source-ref>'] } };
  return `Return the dossier and explicit recipient-bound handoff. Keep the groups distinct and cite every transferred item. Schema: ${JSON.stringify(output)}`;
}

function templateForWorker(contract, type) {
  const template = CONTENT_TEMPLATES[type];
  if (contract.identity?.workerKind !== 'red_worker' || type !== 'verification_report') return template;
  return { ...template, counterexamples: [{ claim: '<claim>', attack: '<attack>', reproductionSteps: ['<step>'], evidence: ['<receipt-ref>'] }] };
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
  return validateWorkerKindArtifact(validateMethodEvidence(result, parsed, methodContract), kind, expected);
}

function validateWorkerKindArtifact(result, kind, type) {
  if (!result.artifact) return result;
  const content = result.artifact.content;
  if (kind === 'red_worker' && type === 'verification_report' && !hasCounterexamples(content.counterexamples)) {
    return { artifact: null, issues: [...result.issues, 'workerArtifact.content.counterexamples.invalid'] };
  }
  if (kind === 'recovery_worker' && type === 'dossier' && !hasRecoveryReceipt(content.recoveryReceipt)) {
    return { artifact: null, issues: [...result.issues, 'workerArtifact.content.recoveryReceipt.invalid'] };
  }
  if (kind === 'liaison_worker' && type === 'dossier' && !hasBoundedHandoff(content.handoff)) {
    return { artifact: null, issues: [...result.issues, 'workerArtifact.content.handoff.invalid'] };
  }
  return result;
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
  const content = {
    claims: parsed.claims,
    ...(kind === 'recovery_worker' ? { recoveryReceipt: parsed.recoveryReceipt } : {}),
    ...(kind === 'liaison_worker' ? { handoff: parsed.handoff } : {})
  };
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
  if (!required.length) return true;
  const report = reportOf(dossier);
  const artifact = report.workerArtifact;
  const kind = worker.workerContract?.identity?.workerKind;
  for (const expected of required) {
    const fields = REQUIRED_FIELDS[expected];
    if (!artifact || artifact.type !== expected || !fields
      || !artifact.content || !contentIsValid(expected, artifact.content)
      || !hasProvenance(artifact) || kindArtifactIsInvalid(kind, expected, artifact.content)) {
      throw artifactError(worker.agentId, expected);
    }
  }
  return true;
}

function kindArtifactIsInvalid(kind, type, content) {
  if (kind === 'red_worker' && type === 'verification_report') return !hasCounterexamples(content?.counterexamples);
  if (kind === 'recovery_worker' && type === 'dossier') return !hasRecoveryReceipt(content?.recoveryReceipt);
  return kind === 'liaison_worker' && type === 'dossier' && !hasBoundedHandoff(content?.handoff);
}

module.exports = { REQUIRED_FIELDS, CONTENT_TEMPLATES, artifactInstruction, validateWorkerArtifact, buildDossierArtifact, buildWorkerArtifact, inspectWorkerArtifact };
