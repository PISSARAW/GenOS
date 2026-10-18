'use strict';

const vocabulary = require('../../../../shared/consciousnessClaimVocabulary.json');

const LAYERS = new Map(Object.entries(vocabulary.layers));
const SUPPORT_STATUSES = new Set(vocabulary.supportStatuses);
const POSITIVE_PHENOMENAL_ASSERTIONS = Object.freeze([
  /\b(?:genos|the agent|this system|the system|it)\s+(?:is|became|remains)\s+(?:conscious|sentient)\b/i,
  /\b(?:genos|the agent|this system|the system|it)\s+(?:feels|experiences|has|possesses)\s+(?:pain|suffering|qualia|subjective experience|phenomenal consciousness)\b/i,
  /\b(?:genos|l['’]agent|ce syst[eè]me|le syst[eè]me|il)\s+(?:est|devient|reste)\s+(?:conscient|consciente|sentient|sentiente)\b/i,
  /\b(?:genos|l['’]agent|ce syst[eè]me|le syst[eè]me|il)\s+(?:ressent|[eé]prouve|poss[eè]de)\s+(?:une?\s+|des\s+|de la\s+)?(?:douleur|souffrance|qualia|exp[eé]rience subjective)\b/i
]);

function reject(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    reject('CONSCIOUSNESS_CLAIM_INVALID', `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeEvidenceRefs(refs) {
  if (refs === undefined) return [];
  if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
    reject('CONSCIOUSNESS_CLAIM_INVALID', 'evidenceRefs must contain non-empty strings.');
  }
  return [...new Set(refs.map((ref) => ref.trim()))];
}

function forbiddenAssertion(text) {
  return POSITIVE_PHENOMENAL_ASSERTIONS.some((pattern) => pattern.test(String(text || '')));
}

function assess(input = {}) {
  const layer = requireText(input.layer, 'layer');
  const status = requireText(input.status, 'status');
  const statement = requireText(input.statement, 'statement');
  const definition = LAYERS.get(layer);
  if (!definition || !definition.allowedStatuses.includes(status)) {
    reject('CONSCIOUSNESS_CLAIM_FORBIDDEN', `Status '${status}' is forbidden for layer '${layer}'.`);
  }
  if (forbiddenAssertion(statement)) {
    reject('CONSCIOUSNESS_CLAIM_FORBIDDEN', 'Positive phenomenal assertions are outside the GenOS evidence boundary.');
  }
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
  if (SUPPORT_STATUSES.has(status) && evidenceRefs.length === 0) {
    reject('CONSCIOUSNESS_CLAIM_EVIDENCE_REQUIRED', `Status '${status}' requires evidenceRefs.`);
  }
  return Object.freeze({
    schema: 'genos.consciousness-claim-assessment/v1',
    layer,
    status,
    statement,
    evidenceRefs: Object.freeze(evidenceRefs),
    phenomenalExperience: vocabulary.phenomenalStatus,
    metaphysicalClaimEstablished: false
  });
}

function scan(value, path = 'report') {
  if (typeof value === 'string' && forbiddenAssertion(value)) {
    reject('CONSCIOUSNESS_CLAIM_FORBIDDEN', `Positive phenomenal assertion rejected at ${path}.`);
  }
  if (Array.isArray(value)) value.forEach((item, index) => scan(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => scan(item, `${path}.${key}`));
  }
}

function boundary() {
  return Object.freeze({
    schema: vocabulary.schema,
    assessedLayers: Object.freeze(['information_processing', 'global_access']),
    phenomenalExperience: vocabulary.phenomenalStatus,
    phenomenalInferenceAllowed: false,
    metaphysicalClaimEstablished: false
  });
}

function protectReport(report = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    reject('CONSCIOUSNESS_CLAIM_INVALID', 'Report must be an object.');
  }
  scan(report);
  const claims = Array.isArray(report.claims) ? report.claims.map(assess) : report.claims;
  return { ...report, ...(claims ? { claims } : {}), epistemicBoundary: boundary() };
}

module.exports = { assess, boundary, protectReport, forbiddenAssertion, vocabulary };
