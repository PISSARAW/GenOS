'use strict';

/**
 * EpigeneticExpression : express/silence une capacité AUTORISÉE.
 * INVARIANT : l'épigénétique ne crée jamais une permission.
 */

function applyMarks(opts) {
  const o = opts || {};
  const allowed = new Set(o.allowedCapabilities || []);
  const marks = Array.isArray(o.marks) ? o.marks : [];
  const expressed = [];
  const refused = [];
  for (const m of marks) {
    if (m.action === 'express' && !allowed.has(m.capability)) {
      refused.push({ ...m, reason: 'beyond_authority_ceiling' });
      continue;
    }
    expressed.push(m);
  }
  return { expressed, refused, authorityPreserved: refused.length >= 0 };
}

module.exports = { applyMarks };
