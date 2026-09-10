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

function isTextItem(item) {
  return typeof item === 'string' && Boolean(item.trim());
}

function hasEvidenceItem(item) {
  if (typeof item === 'string' && item.trim()) return true;
  return Boolean(item && typeof item === 'object' && Object.keys(item).length > 0);
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
