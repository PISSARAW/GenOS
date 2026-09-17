'use strict';

/**
 * Leibnizian Service — Monades, harmonie préétablie, monadologie.
 *
 * Mapping GenOS :
 *  - Monade = substance simple, indévisível, sans parties (l'agent autonome)
 *  - Harmonie préétablie = coordination parfaite entre monades sans interaction
 *  - Monadologie = système de monades reflétant l'univers de leur point de vue
 *  - Principe de raison suffisante = tout a une raison/explication
 *  - Lois de continuation et d'harmonie
 *
 * Référence : Leibniz, *Monadologie*, *Principes de la nature et de la grâce*.
 */

/**
 * monadologie — décrit un agent comme une monade leibnizienne.
 * Chaque monade est un miroir indépendant de l'univers entier.
 */
function monadologie({ agent }) {
  if (!agent) throw new Error('leibnizianService.monadologie requires an agent');
  return {
    agentId: agent.id,
    substance: 'monade',
    type: 'simple_substance',
    indivisible: true,
    sansParties: true,
    perspective: agent.id,
    refleteUniverse: true,
    description: `L'agent ${agent.id} est une monade — substance simple, indévisível, reflétant l'univers de son point de vue.`,
  };
}

/**
 * harmoniePreEtablie — évalue si l'agent opère selon une coordination
 * préétablie avec les autres agents (sans interaction directe).
 */
function harmoniePreEtablie({ agent, schedule }) {
  if (!agent) throw new Error('leibnizianService.harmoniePreEtablie requires an agent');
  return {
    agentId: agent.id,
    harmonie: true,
    interactionDirecte: false,
    coordination: 'pre-etablie',
    source: 'intelligence_optimale',
    programme: schedule || [],
    description: `L'agent ${agent.id} opère selon une harmonie préétablie — coordination parfaite sans interaction directe.`,
  };
}

/**
 * principeRaisonSuffisante — vérifie qu'une action a une raison suffisante.
 * "Nihil est sine ratione" — rien n'est sans raison.
 */
function principeRaisonSuffisante({ action, reason }) {
  if (!action) throw new Error('leibnizianService.principeRaisonSuffisante requires an action');
  const hasReason = !!reason && reason.length > 0;
  return {
    action,
    reason: reason || null,
    hasReason,
    principle: 'nihil est sine ratione',
    valid: hasReason,
    description: hasReason
      ? `L'action "${action}" a une raison suffisante.`
      : `L'action "${action}" n'a pas de raison suffisante — violation du principe.`,
  };
}

/**
 * loisDeContinuation — évalue la continuité d'une série d'événements.
 * Leibniz : la nature ne fait pas de sauts (continuité).
 */
function loisDeContinuation({ events }) {
  if (!events || !Array.isArray(events)) throw new Error('leibnizianService.loisDeContinuation requires events array');
  const gaps = [];
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (prev.timestamp && curr.timestamp) {
      const gap = curr.timestamp - prev.timestamp;
      if (gap > 1000) gaps.push({ index: i, gap });
    }
  }
  return {
    events: events.length,
    gaps: gaps.length,
    continuous: gaps.length === 0,
    law: 'natura non facit saltus',
    description: gaps.length === 0
      ? 'La série est continue — la nature ne fait pas de sauts.'
      : `La série a ${gaps.length} discontinuité(s).`,
  };
}

/**
 * calculRaisonSuffisante — détermine la raison suffisante d'un état.
 * Trouve la cause ou l'explication qui rend l'état nécessaire.
 */
function calculRaisonSuffisante({ state, causes }) {
  if (!state) throw new Error('leibnizianService.calculRaisonSuffisante requires a state');
  const validCauses = (causes || []).filter(c => c && c.explanation);
  return {
    state,
    causes: validCauses,
    reasonFound: validCauses.length > 0,
    bestCause: validCauses[0] || null,
    principle: 'raison suffisante',
    description: validCauses.length > 0
      ? `Raison suffisante trouvée pour l'état "${state}".`
      : `Aucune raison suffisante trouvée pour l'état "${state}".`,
  };
}

module.exports = {
  monadologie,
  harmoniePreEtablie,
  principeRaisonSuffisante,
  loisDeContinuation,
  calculRaisonSuffisante,
};
