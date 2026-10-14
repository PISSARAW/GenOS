/**
 * Shared primitives for worker evidence scoring, validation, and dossiers.
 */
const FAILURE_EVENT_TYPES = ['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'];
const NON_EVIDENCE_FIELDS = new Set([
  'status', 'state', 'outcome', 'success', 'ok', 'passed', 'completed',
  'eligible', 'verified', 'confidence', 'verificationstatus', 'isverified'
]);

function isEvidenceField(key) {
  return !NON_EVIDENCE_FIELDS.has(String(key).toLowerCase().replace(/[^a-z]/g, ''));
}

function hasSubstantiveObjectValue(value, predicate) {
  return Object.entries(value).some(([key, item]) => isEvidenceField(key) && predicate(item));
}

function extractEvidenceReport(value) {
  if (!value || typeof value !== 'object') return {};
  if (value.evidenceReport && typeof value.evidenceReport === 'object') return value.evidenceReport;
  if (value.report && typeof value.report === 'object') return value.report;
  return value;
}

function isPlaceholderText(value) {
  const normalized = String(value).trim().toLowerCase();
  return normalized === '' || ['none', 'n/a', 'na', 'null', 'nil', 'todo', 'tbd', 'fake', '-', '...'].includes(normalized);
}

function isTextItem(item) {
  return typeof item === 'string' && !isPlaceholderText(item);
}

function hasUsableValue(value) {
  if (typeof value === 'string') return !isPlaceholderText(value);
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasEvidenceItem);
  if (value && typeof value === 'object') return hasSubstantiveObjectValue(value, hasUsableValue);
  return false;
}

function hasEvidenceItem(item) {
  if (typeof item === 'string') return isTextItem(item);
  if (Array.isArray(item)) return item.some(hasEvidenceItem);
  if (item && typeof item === 'object') return hasSubstantiveObjectValue(item, hasUsableValue);
  return false;
}

function normalizeNoAnswerProof(proof) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return null;
  const method = typeof proof.method === 'string' ? proof.method.trim() : '';
  const evidence = Array.isArray(proof.evidence)
    ? proof.evidence.filter(isTextItem).map((item) => item.trim()) : [];
  return method && evidence.length ? { ...proof, method, evidence } : null;
}

function boundedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function boundedEvidenceScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

module.exports = {
  FAILURE_EVENT_TYPES,
  extractEvidenceReport,
  isTextItem,
  hasEvidenceItem,
  normalizeNoAnswerProof,
  boundedScore,
  boundedEvidenceScore
};
