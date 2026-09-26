'use strict';

/**
 * Chimères cognitives (hétérogénéité interne maintenue, pas fusionnée).
 *
 * Deux systèmes incompatibles coexistent : compartments A et B gardent leurs
 * croyances verbatim, `shared` porte les observations communes. Aucune
 * réconciliation prématurée : resolve() tranche seulement sur evidence
 * explicite ({supportsA, supportsB}) vers A_wins / B_wins / sustained /
 * inconclusive. Pur et déterministe ; la persistance vit dans les records
 * qui embarquent la chimère (branches rollout, hypothèses).
 */

function cleanBeliefs(list) {
  if (!Array.isArray(list)) return [];
  const beliefs = [];
  for (const item of list) {
    const text = typeof item === 'string' ? item : item?.statement;
    if (typeof text !== 'string' || !text.trim()) continue;
    beliefs.push(text.trim().slice(0, 300));
    if (beliefs.length >= 20) break;
  }
  return beliefs;
}

function weaveChimera(left, right, shared) {
  return {
    compartments: [
      { label: 'A', beliefs: cleanBeliefs(left) },
      { label: 'B', beliefs: cleanBeliefs(right) }
    ],
    shared: cleanBeliefs(shared),
    status: 'held',
    createdAt: new Date().toISOString()
  };
}

function resolveChimera(chimera, evidence) {
  const data = evidence || {};
  const supportsA = data.supportsA === true;
  const supportsB = data.supportsB === true;
  if (supportsA && !supportsB) return { status: 'A_wins', winner: 'A' };
  if (supportsB && !supportsA) return { status: 'B_wins', winner: 'B' };
  if (supportsA && supportsB) return { status: 'sustained', winner: null };
  return { status: 'inconclusive', winner: null };
}

module.exports = { weaveChimera, resolveChimera };
