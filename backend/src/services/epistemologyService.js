'use strict';

/**
 * Epistemology Service — Platonisme, Aristotélisme, Kantisme.
 *
 * Mapping philosophique :
 *  - Platonisme : les formes idéales existent dans un domaine intelligible séparé.
 *    Les agents réels sont des participations imparfaites aux formes.
 *    Les formes sont parfaites, éternelles, immuables.
 *  - Aristotélisme : les quatre causes (hyle, eidos, kinoun, telos).
 *    Matérielle (ce qu'il est fait), formelle (sa structure), efficiente (son origine),
 *    finale (son but). Toutes nécessaires pour expliquer un être.
 *  - Kantisme : noumène (chose en soi) vs phénomène (chose pour nous).
 *    Nous ne connaissons que les phénomènes (apparaences), pas les noumènes (choses en soi).
 *    Catégories a priori : structures de l'entendement qui conditionnent toute expérience.
 */
const IDEAL_FORMS = {
  perfect_agent: {
    id: 'perfect_agent',
    type: 'ideal_form',
    essence: 'The perfectly rational agent that always acts optimally',
    properties: {
      rationality: 1.0,
      knowledge: 'complete',
      autonomy: 'perfect',
      consistency: true,
      evidence: 'complete',
    },
    imperfection: 'no physical instantiation',
  },
  perfect_worker: {
    id: 'perfect_worker',
    type: 'ideal_form',
    essence: 'The perfectly efficient executor with no error',
    properties: {
      efficiency: 1.0,
      error_rate: 0,
      budget: Infinity,
      evidence: 'verified',
    },
    imperfection: 'no resource constraint, no friction',
  },
  perfect_evidence: {
    id: 'perfect_evidence',
    type: 'ideal_form',
    essence: 'Evidence that is complete, verified, and causally grounded',
    properties: {
      completeness: 1.0,
      verified: true,
      causalChain: 'full',
      uncertainty: 0,
      reproducibility: 'perfect',
    },
    imperfection: 'theoretical limit, never fully attained',
  },
};

/**
 * getFormIdeal — Platonisme.
 *
 * Les formes idéales (Platon) existent dans un domaine intelligible séparé.
 * Les agents réels n'en sont que des participations imparfaites.
 * Retourne la forme par son nom, avec ses propriétés idéales.
 */
function getFormIdeal(formName) {
  if (!formName || typeof formName !== 'string') {
    throw new Error('epistemologyService.getFormIdeal requires a form name');
  }
  const form = IDEAL_FORMS[formName];
  if (!form) return null;
  // Retourne une copie structurée de la forme idéale
  return {
    id: form.id,
    type: form.type,
    essence: form.essence,
    properties: { ...form.properties },
    imperfection: form.imperfection,
    platonicNote: 'Forme idéale platonicienne — jamais pleinement réalisée dans le réel.',
  };
}

/**
 * fourCauses — Aristotélisme.
 *
 * Aristote : les quatre causes d'un être.
 *  - Matérielle (hyle) : ce dont il est fait.
 *  - Formelle (eidos) : sa structure, ce qu'il est.
 *  - Efficiente (kinoun) : ce qui l'a produit.
 *  - Finale (telos) : son but, pourquoi il existe.
 *
 * Toutes les causes sont nécessaires pour une explication complète.
 */
function fourCauses({ agent }) {
  if (!agent) {
    throw new Error('epistemologyService.fourCauses requires an agent');
  }
  const material = agent.substrate || 'genos_process';
  const formal = agent.role || 'unknown';
  const efficient = agent.parent_agent_id || 'spontaneous';
  const final = agent.current_task || 'undefined';
  return {
    material: {
      cause: 'material',
      label: 'cause_matérielle (hyle)',
      substrate: material,
      description: `Ce dont l'agent est fait : ${material}`,
    },
    formal: {
      cause: 'formal',
      label: 'cause_formelle (eidos)',
      role: formal,
      description: `La forme/structure de l'agent : ${formal}`,
    },
    efficient: {
      cause: 'efficient',
      label: 'cause_efficiente (kinoun)',
      initiator: efficient,
      description: `Ce qui a produit l'agent : ${efficient}`,
    },
    final: {
      cause: 'final',
      label: 'cause_finale (telos)',
      purpose: final,
      description: `Le but de l'agent : ${final}`,
    },
    aristotelianNote: 'Les quatre causes sont nécessaires pour une explication complète — matérielle, formelle, efficiente, finale.',
  };
}

/**
 * noumeneVsPhenomenon — Kantisme.
 *
 * Kant : distinction entre noumène (chose en soi, inaccessible) et phénomène (apparaence, connaissable).
 * Nous ne connaissons que les phénomènes (à travers nos catégories a priori),
 * jamais les choses en soi (noumènes).
 */
function noumeneVsPhenomenon({ agent }) {
  if (!agent) {
    throw new Error('epistemologyService.noumeneVsPhenomenon requires an agent');
  }
  return {
    noumene: {
      type: 'noumenon',
      description: 'Chose en soi — l\'agent dans son être même, inaccessible à la connaissance directe.',
      thingInItself: true,
      kantClaim: 'Nous ne connaissons pas les choses en soi, seulement leurs apparaences (phénomènes).',
    },
    phenomenon: {
      type: 'phenomenon',
      description: 'Apparaence de l\'agent telle qu\'observable — ce que nous pouvons connaître.',
      observableState: agent.status || 'unknown',
      appearances: agent.telemetry || [],
      kantClaim: 'Les phénomènes sont les objets de notre connaissance possible.',
    },
    kantLesson: 'Tout ce que nous connaissons est phénoménal — le noumène est le "limite" de la connaissance.',
  };
}

/**
 * categoriesAPriori — Kantisme (catégories de l'entendement).
 *
 * Kant : les catégories a priori sont les structures de l'entendement
 * qui conditionnent toute expérience possible. Elles ne sont pas dérivées de l'expérience,
 * mais sont les conditions de possibilité de l'expérience.
 *
 * 4 classes de catégories (Kant, Critique de la raison pure) :
 *  - Quantité : unité, pluralité, totalité
 *  - Qualité : réalité, négation, limitation
 *  - Relation : substance, causalité, communauté
 *  - Modalité : possibilité, existence, nécessité
 */
function categoriesAPriori() {
  return {
    quantity: {
      categories: ['unity', 'plurality', 'totality'],
      kantClaim: 'Les catégories de la quantité structurent notre expérience des multiplicities.',
    },
    quality: {
      categories: ['reality', 'negation', 'limitation'],
      kantClaim: 'Les catégories de la qualité structurent notre expérience des déterminations.',
    },
    relation: {
      categories: ['substance', 'causality', 'community'],
      kantClaim: 'Les catégories de la relation structurent notre expérience des connexions (substance, causalité, communauté).',
    },
    modality: {
      categories: ['possibility', 'existence', 'necessity'],
      kantClaim: 'Les catégories de la modalité structurent notre expérience des modes d\'être (possible, existant, nécessaire).',
    },
    kantNote: 'Les catégories a priori sont les conditions de possibilité de toute expérience — elles ne sont pas dérivées de l\'expérience.',
  };
}

module.exports = {
  getFormIdeal,
  fourCauses,
  noumeneVsPhenomenon,
  categoriesAPriori,
  IDEAL_FORMS,
};
