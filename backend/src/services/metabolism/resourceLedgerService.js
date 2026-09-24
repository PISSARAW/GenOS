'use strict';

/**
 * ResourceLedger (G4) : hiérarchie Mission -> Topology -> Sub-orch ->
 * Worker -> Procedure -> Tool. Aucune couche enfant ne crée de ressource.
 */

const { getMetabolic, setMetabolic } = require('./metabolicStateService');

const ORDER = ['mission', 'topology', 'suborchestrator', 'worker', 'procedure', 'toolcall'];

function scopeKey(level, id) {
  return `${level}:${id}`;
}

function allocateHierarchy(opts) {
  const o = opts || {};
  const total = Number(o.totalTokens) || 0;
  const counts = o.counts || {};
  const per = splitEvenly(total, counts);
  for (const level of ORDER) {
    const ids = counts[level] || [];
    for (const id of ids) {
      setMetabolic({ scopeId: scopeKey(level, id), patch: { tokenBudget: per[level] || 0 } });
    }
  }
  return { total, perLevel: per };
}

function splitEvenly(total, counts) {
  const out = {};
  const workerCount = (counts.worker || []).length || 1;
  out.worker = total / workerCount;
  return out;
}

function budgetOf(scope) {
  const state = getMetabolic(scope);
  return (state && state.tokenBudget) || 0;
}

function childExceedsParent(opts) {
  const o = opts || {};
  const parent = budgetOf(o.parentScope);
  const childSum = (o.childScopes || []).reduce((s, c) => s + budgetOf(c), 0);
  return childSum > parent;
}

module.exports = { allocateHierarchy, childExceedsParent, scopeKey, ORDER };
