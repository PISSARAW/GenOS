'use strict';

/**
 * Kantian Service — Noumène / phénomène, catégories a priori.
 *
 * Mapping GenOS :
 *  - Phénomène = ce qui est accessible aux agents via les senseurs (l'observable)
 *  - Noumène = ce qui existe mais est inaccessible à l'intelligence (l'en-soi)
 *  - Catégories a priori = structure mentale qui organise l'expérience
 *  - Chose-en-soi = l'objet indépendamment de notre perception
 *  - Critique = évaluation des limites de la connaissance
 *
 * Référence : Kant, *Critique de la raison pure* (1781/1787).
 */

/**
 * phenomene — ce qui est accessible à l'agent par ses senseurs.
 * Le phénomène est l'objet de l'expérience, structuré par les catégories a priori.
 */
function phenomene({ agent, observation }) {
  if (!agent) throw new Error('kantianService.phenomene requires an agent');
  return {
    agentId: agent.id,
    type: 'phénomène',
    observable: true,
    experience: observation || null,
    categories: ['espace', 'temps', 'causalité', 'unité', 'pluralité'],
    description: `L'agent ${agent.id} accède au phenomenon via ses senseurs, structuré par les catégories a priori.`,
  };
}

/**
 * noumene — la chose-en-soi (Ding an sich).
 * Le noumène existe mais est inaccessible à l'intelligence des agents.
 * C'est ce qui reste indépendamment de notre perception.
 */
function noumene({ chose }) {
  if (!chose) throw new Error('kantianService.noumene requires a chose');
  return {
    chose,
    type: 'noumène',
    observable: false,
    accessible: false,
    description: `La chose "${chose}" existe en soi mais reste inaccessible à l'intelligence des agents.`,
  };
}

/**
 * categoriesAPriori — les catégories a priori de l'entendement.
 * Structurent l'expérience des agents (espace, temps, causalité).
 */
function categoriesAPriori() {
  return {
    categories: ['espace', 'temps', 'causalité', 'unité', 'pluralité', 'totalité'],
    type: 'a priori',
    description: 'Les catégories a priori structurent l\'expérience des agents.',
  };
}

/**
 * critiqueRaisonPure — évalue les limites de la connaissance.
 * Distingue ce qui est connaissable (phénomène) de ce qui ne l'est pas (noumène).
 */
function critiqueRaisonPure({ agent }) {
  if (!agent) throw new Error('kantianService.critiqueRaisonPure requires an agent');
  return {
    agentId: agent.id,
    connaissable: ['phénomène', 'catégories a priori'],
    inconnaissable: ['noumène', 'chose-en-soi'],
    limites: 'La raison pure ne peut connaître que les phénomènes, pas les noumènes.',
    description: `L'agent ${agent.id} est limité aux phenomenes sauf categories.`,
  };
}

/**
 * choseEnSoi — la chose indépendamment de notre perception.
 * Distinction entre comment les agents voient les choses et comment elles sont.
 */
function choseEnSoi({ agent, representation }) {
  if (!agent) throw new Error('kantianService.choseEnSoi requires an agent');
  return {
    agentId: agent.id,
    choseEnSoi: representation,
    representation: 'représentation subjective',
    limitesLesConnaissances: true,
    description: `L'agent ${agent.id} construit sa representation de la chose-en-soi sans jamais y accéder directement.`,
  };
}

module.exports = {
  phenomene,
  noumene,
  categoriesAPriori,
  critiqueRaisonPure,
  choseEnSoi,
};
