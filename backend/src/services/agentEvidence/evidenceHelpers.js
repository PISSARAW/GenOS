/**
 * Shared primitives for worker evidence scoring, validation, and dossiers.
 */
const FAILURE_EVENT_TYPES = ['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'];

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
  if (value && typeof value === 'object') return Object.values(value).some(hasUsableValue);
  return false;
}

function hasEvidenceItem(item) {
  if (typeof item === 'string') return isTextItem(item);
  if (Array.isArray(item)) return item.some(hasEvidenceItem);
  if (item && typeof item === 'object') return Object.values(item).some(hasUsableValue);
  return false;
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
  boundedScore,
  boundedEvidenceScore
};
