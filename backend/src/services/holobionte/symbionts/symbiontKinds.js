'use strict';

const SYMBIONT_KINDS = Object.freeze([
  'AGENT', 'MODEL', 'TOOL', 'PROCEDURE', 'DAEMON', 'MEMORY', 'VERIFIER',
  'DATABASE', 'SUB_TOPOLOGY'
]);

function normalizeSymbiontKind(value) {
  const kind = String(value || 'AGENT').trim().toUpperCase();
  if (!SYMBIONT_KINDS.includes(kind)) {
    throw Object.assign(new Error(`Unsupported symbiont kind: ${kind}`), { code: 'HOLOBIONT_SYMBIONT_KIND_INVALID' });
  }
  return kind;
}

module.exports = { SYMBIONT_KINDS, normalizeSymbiontKind };
