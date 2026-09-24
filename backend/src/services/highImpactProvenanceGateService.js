'use strict';

/**
 * Gate universel de provenance pour changements à fort impact.
 *
 * Invariant : `all_high_impact_changes_require_provenance`.
 * Un changement est à fort impact si : risque HIGH/CRITICAL, ou
 * réversibilité faible/irréversible, ou portée non locale, ou action
 * structurelle (topology, spawn, promote, mutate).
 * Sans provenance complète, le gate refuse ou exige une revue humaine —
 * jamais d'approbation silencieuse.
 */

const STRUCTURAL_ACTIONS = Object.freeze(['topology', 'spawn', 'promote', 'mutate']);

function safeInput(input) {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object') return {};
  return input;
}

function textOf(value, fallback) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function isHighImpact(input) {
  const source = safeInput(input);
  const action = textOf(source.action, '').toLowerCase();
  const risk = textOf(source.risk || source.actionRisk, 'LOW').toUpperCase();
  const reversibility = textOf(source.reversibility, 'reversible').toLowerCase();
  const blast = textOf(source.blastRadius || source.blast_radius, 'local').toLowerCase();
  if (risk === 'HIGH' || risk === 'CRITICAL') return true;
  if (reversibility === 'low' || reversibility === 'irreversible') return true;
  if (blast !== 'local') return true;
  if (STRUCTURAL_ACTIONS.includes(action)) return true;
  return false;
}

function provenanceStatus(input) {
  const source = safeInput(input);
  const refs = Array.isArray(source.evidenceRefs) ? source.evidenceRefs : [];
  const hash = textOf(source.provenanceHash || source.provenanceRecordId, '');
  const complete = Boolean(hash) && refs.length > 0;
  return { complete, hasHash: Boolean(hash), evidenceCount: refs.length };
}

function gate(input) {
  const source = safeInput(input);
  if (!isHighImpact(source)) return { verdict: 'ALLOW', reason: 'low-impact' };
  const status = provenanceStatus(source);
  if (status.complete) return { verdict: 'ALLOW', reason: 'provenance-complete' };
  if (source.allowHumanReview === false) {
    return { verdict: 'DENY', reason: 'high-impact-without-provenance' };
  }
  return { verdict: 'HUMAN_REVIEW', reason: 'high-impact-without-provenance' };
}

module.exports = {
  STRUCTURAL_ACTIONS,
  isHighImpact,
  provenanceStatus,
  gate
};
