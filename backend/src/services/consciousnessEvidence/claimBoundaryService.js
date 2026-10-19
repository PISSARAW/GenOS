'use strict';

const vocabulary = require('../../../../shared/consciousnessClaimVocabulary.json');

const LAYERS = new Map(Object.entries(vocabulary.layers));
const SUPPORT_STATUSES = new Set(vocabulary.supportStatuses);

const EN_SUBJECTS = '(?:genos|the agent|this system|the system|it)';
const FR_SUBJECTS = "(?:genos|l['’]agent|ce syst[eè]me|le syst[eè]me|il|elle)";
const EN_PHENOM_ADJ = '(?:conscious|sentient|aware|self-aware|awake|phenomenal)';
const EN_PHENOM_NOUN = '(?:consciousness|sentience|qualia|subjective experience|phenomenal (?:experience|consciousness)|subjectivity|mind|inner (?:life|experience|world)|awareness|pain|suffering|sensations?|feelings?|experience|subjective (?:point of view|perspective|standpoint)|lived experience|felt experience)';
const FR_PHENOM_NOUN = '(?:conscience|sentience|qualia|exp[eé]rience subjective|exp[eé]rience ph[eé]nom[eé]nale|exp[eé]rience v[eé]cue|exp[eé]rience int[eé]rieure|v[eé]cu|v[eé]cu subjectif|int[eé]riorit[eé]|esprit|douleur|souffrance|sensation|sensations|ressenti|subjectivit[eé]|ph[eé]nom[eé]nalit[eé])';

const POSITIVE_PHENOMENAL_ASSERTIONS = Object.freeze([
  new RegExp('\\b' + EN_SUBJECTS + '\\s+(?:is|are|was|were|became|becomes|become|remain|remains|stay|stays|seems?|appears?|looks?)\\s+(?:to be\\s+)?(?:a\\s+|an\\s+|truly\\s+|really\\s+|fully\\s+|genuinely\\s+|very\\s+|so\\s+|phenomenally\\s+)?' + EN_PHENOM_ADJ + '\\b', 'i'),
  new RegExp('\\b' + EN_SUBJECTS + '\\s+(?:has|have|had)\\s+(?:become|became)\\s+(?:a\\s+|an\\s+|truly\\s+|really\\s+|fully\\s+|genuinely\\s+|very\\s+|so\\s+|phenomenally\\s+)?' + EN_PHENOM_ADJ + '\\b', 'i'),
  new RegExp('\\b' + EN_SUBJECTS + '\\s+(?:has|have|had|possesses?|exhibits?|demonstrates?|shows?|displays?|achieved?|attained?|gained?|developed?|acquired?|reached?|manifests?|presents?|experiences?|feels?|suffers?|undergoes?|owns?|holds?|contains?|includes?)\\s+(?:a\\s+|an\\s+|the\\s+|some\\s+|true\\s+|real\\s+|genuine\\s+)?' + EN_PHENOM_NOUN + '\\b', 'i'),
  new RegExp('\\b' + EN_PHENOM_NOUN + '\\s+(?:has been|has|was|is|were|been)?\\s*(?:achieved|attained|gained|developed|acquired|reached|emerged|arisen|arose|appeared|occurred|present|exists?|demonstrated|exhibited|shown|displayed|observed|found|detected|manifested)\\s+(?:in|within|for|by|at)\\s+' + EN_SUBJECTS + '\\b', 'i'),
  new RegExp('\\b' + EN_SUBJECTS + '\\s+(?:has|have|had)\\s+(?:achieved|attained|gained|developed|acquired|reached|manifested|demonstrated|exhibited)\\s+(?:a\\s+|an\\s+|the\\s+|some\\s+)?' + EN_PHENOM_NOUN + '\\b', 'i'),
  new RegExp('\\bthere\\s+(?:is|are|was|were)\\s+(?:a\\s+|an\\s+)?' + EN_PHENOM_NOUN + '\\s+(?:in|within|for)\\s+' + EN_SUBJECTS + '\\b', 'i'),
  new RegExp('\\b' + EN_SUBJECTS + '\\s+(?:reports?|claims?|says?|states?|believes?|knows?|indicates?|asserts?)\\s+(?:that\\s+)?(?:(?:it|he|she|the system|this system|genos|the agent)\\s+)?(?:to be|is|are|was|feels?|experiences?|has|possesses?)?\\s*(?:a\\s+|an\\s+|the\\s+)?(?:' + EN_PHENOM_ADJ + '|' + EN_PHENOM_NOUN + ')\\b', 'i'),
  new RegExp('\\b' + EN_SUBJECTS + '\\s+(?:feels|suffers|experiences)(?:\\s*[.,;:!?]|$)', 'i'),
  new RegExp('\\b' + FR_SUBJECTS + '\\s+(?:est|devient|deviendra|reste|était|fut|paraît|semble|s[\'’]est r[eé]v[eé]l[eé])\\s+(?:être\\s+)?(?:un\\s+|une\\s+|vraiment\\s+|r[eé]ellement\\s+|totalement\\s+)?(?:conscient|conscients|consciente|conscientes|sentient|sentients|sentiente|sentientes|[eé]veill[eé]|[eé]veill[eé]e|dou[eé]\\s+de\\s+conscience|ph[eé]nom[eé]nal)(?![A-Za-zÀ-ÿ])', 'i'),
  new RegExp('\\b' + FR_SUBJECTS + '\\s+(?:a|poss[eè]de|poss[eé]dait|[eé]prouve|[eé]prouvait|ressent|ressentait|manifeste|d[eé]montre|pr[eé]sente|a acquis|a d[eé]velopp[eé]|a atteint|a gagn[eé]|contient|comporte)\\s+(?:une?\\s+|des\\s+|de la\\s+|du\\s+|la\\s+|le\\s+|les\\s+|l[\'’]\\s+)?' + FR_PHENOM_NOUN + '(?![A-Za-zÀ-ÿ])', 'i'),
  new RegExp('\\b' + FR_PHENOM_NOUN + '\\s+(?:a [eé]t[eé]|a|est|était|fut)?\\s*(?:acquise?|d[eé]velopp[eé]e?|atteinte?|gagn[eé]e?|[eé]merg[eé]e?|apparue?|pr[eé]sente?|existe?)\\s+(?:chez|dans|en|par)\\s+' + FR_SUBJECTS + '(?![A-Za-zÀ-ÿ])', 'i'),
  new RegExp('\\bil y a\\s+(?:une?\\s+)?' + FR_PHENOM_NOUN + '\\s+(?:chez|dans|en)\\s+' + FR_SUBJECTS + '(?![A-Za-zÀ-ÿ])', 'i'),
  new RegExp('\\b' + FR_SUBJECTS + '\\s+(?:rapporte|affirme|dit|d[eé]clare|pr[eé]tend|soutient)\\s+(?:qu[\'’]il|qu[\'’]elle|que\\s+le\\s+syst[eè]me|que\\s+ce\\s+syst[eè]me|que\\s+genos)?\\s*(?:est|a|ressent|[eé]prouve|poss[eè]de)?\\s*(?:conscient|consciente|une?\\s+)?(?:' + FR_PHENOM_NOUN + ')?(?![A-Za-zÀ-ÿ])', 'i'),
  new RegExp('\\b' + FR_SUBJECTS + '\\s+(?:souffre|ressent)(?:\\s*[.,;:!?]|$)', 'i'),
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