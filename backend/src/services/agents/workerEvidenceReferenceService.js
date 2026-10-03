'use strict';

const PLACEHOLDERS = new Set(['', 'none', 'n/a', 'na', 'null', 'nil', 'todo', 'tbd', 'fake', '-']);

function evidenceReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string'
    && !PLACEHOLDERS.has(item.trim().toLowerCase())
    && item.trim().length > 0);
}

function hasEvidenceReferences(value) {
  return Array.isArray(value) && value.length > 0
    && evidenceReferences(value).length === value.length;
}

function provenanceReferences(artifact) {
  const provenance = artifact?.provenance || {};
  return provenance.sourceRefs || provenance.evidenceRefs || artifact?.evidenceRefs;
}

module.exports = { evidenceReferences, hasEvidenceReferences, provenanceReferences };
