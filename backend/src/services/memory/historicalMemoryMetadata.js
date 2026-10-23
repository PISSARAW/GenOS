'use strict';

function references(value) {
  return Array.isArray(value) ? value : [];
}

function metadataFor(item) {
  return {
    evidenceRefs: references(item.evidenceRefs),
    counterexampleRefs: references(item.counterexampleRefs),
    provenance: item.provenance || null,
    provenanceIntegrity: item.provenanceIntegrity || null,
    recall: item.recall || null
  };
}

function hasMetadata(metadata) {
  return Object.values(metadata).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
}

module.exports = { metadataFor, hasMetadata };
