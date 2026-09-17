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

function phenomene({ agent, observation }) {
  if (!agent) throw new Error('kantianService.phenomene requires an agent');
  return {
    agentId: agent.id,
    type: 'phénomène',
    observable: true,
    experience: observation || null,
    categories: ['espace', 'temps', 'causalité', 'unité', 'pluralité'],
    description: `L'agent ${agent.id} accède au phénomène via ses senseurs, structuré par les catégories a priori.`,
  };
}

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

function categoriesAPriori() {
  return {
    categories: ['espace', 'temps', 'causalité', 'unité', 'pluralité', 'totalité'],
    type: 'a priori',
    description: 'Les catégories a priori structurent l\'expérience des agents.',
  };
}

function critiqueRaisonPure({ agent }) {
  if (!agent) throw new Error('kantianService.critiqueRaisonPure requires an agent');
  return {
    agentId: agent.id,
    connaissable: ['phénomène', 'catégories a priori'],
    inconnaissable: ['noumène', 'chose-en-soi'],
    limites: 'La raison pure ne peut connaître que les phénomènes, pas les noumènes.',
    description: `L'agent ${agent.id} est limité aux phénomènes sauf catégories.`,
  };
}

function choseEnSoi({ agent, representation }) {
  if (!agent) throw new Error('kantianService.choseEnSoi requires an agent');
  return {
    agentId: agent.id,
    choseEnSoi: representation,
    representation: 'représentation subjective',
    limitesLesConnaissances: true,
    description: `L'agent ${agent.id} construit sa représentation de la chose-en-soi sans jamais y accéder directement.`,
  };
}

module.exports = {
  phenomene,
  noumene,
  categoriesAPriori,
  critiqueRaisonPure,
  choseEnSoi,
};
