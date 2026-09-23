'use strict';

/**
 * DevelopmentalTransition : garde-fous des transitions de stade.
 */

const { getDevelopmental, setDevelopmental } = require('./developmentalStateService');

const ALLOWED = {
  PLURIPOTENT: ['PROGENITOR', 'DIFFERENTIATING'],
  PROGENITOR: ['DIFFERENTIATING', 'PLURIPOTENT'],
  DIFFERENTIATING: ['SPECIALIZED', 'PLASTIC'],
  SPECIALIZED: ['PLASTIC', 'CONSOLIDATING', 'SENESCENT'],
  PLASTIC: ['DIFFERENTIATING', 'CONSOLIDATING'],
  CONSOLIDATING: ['STABLE', 'PLASTIC'],
  STABLE: ['PLASTIC', 'SENESCENT'],
  SENESCENT: []
};

function transition(opts) {
  const o = opts || {};
  const prev = getDevelopmental(o.agentId);
  const next = o.to || 'PROGENITOR';
  const allowed = ALLOWED[prev.stage] || [];
  if (!allowed.includes(next)) return { ok: false, from: prev.stage, to: next };
  return { ok: true, state: setDevelopmental({ agentId: o.agentId, patch: { stage: next } }) };
}

module.exports = { transition, ALLOWED };
