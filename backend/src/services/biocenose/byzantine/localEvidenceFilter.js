'use strict';

function filter(evidence) {
  const items = Array.isArray(evidence) ? evidence : [];
  return {
    accepted: items.filter(isUsable),
    rejected: items.filter((item) => !isUsable(item)).map((item) => ({
      evidenceRef: item.evidenceRef || null, reason: 'MISSING_PROVENANCE_OR_VERIFICATION'
    }))
  };
}

function isUsable(item) {
  return item && typeof item.evidenceRef === 'string' && item.evidenceRef.trim()
    && (item.status === 'VERIFIED' || item.reproducible === true);
}

module.exports = { filter };
