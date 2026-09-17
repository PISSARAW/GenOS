'use strict';

/**
 * Realism / Nominalism / Conceptualism Service
 *
 * Mapping GenOS :
 *  - Realisme   : les universaux existent indépendamment de l'esprit (ex: formes idéales, essences DB)
 *  - Nominalisme : seuls les particuliers existent ; les universaux sont des noms (ex: tags, rôles qui n'ont pas d'essence formelle)
 *  - Conceptualisme : les universaux existent comme concepts dans l'esprit d'un agent (ex: catégories, critères de classification internes)
 *
 * Référence : Platon (réalisme), Abélard / Ockham (nominalisme), Abelard / conceptualisme médiéval,
 *             Kant (conceptualisme moderne), Quine (critique des universality).
 */

const ONTOLOGICAL_STANCES = {
  REALISM: 'realism',
  NOMINALISM: 'nominalism',
  CONCEPTUALISM: 'conceptualism',
};

/**
 * classifyTerm — détermine le statut ontologique d'un terme selon la stance choisie.
 *
 * Retourne :
 *  - terme, stance, status (universel / particulier / concept), description, implication.
 */
function classifyTerm({ term, stance }) {
  if (!term || typeof term !== 'string') {
    throw new Error('ontologyStances.classifyTerm requires term and stance');
  }
  if (!Object.values(ONTOLOGICAL_STANCES).includes(stance)) {
    throw new Error(
      `Invalid stance: ${stance}. Must be one of: ${Object.values(ONTOLOGICAL_STANCES).join(', ')}`
    );
  }

  switch (stance) {
    case ONTOLOGICAL_STANCES.REALISM:
      return {
        term,
        stance,
        status: 'universel',
        description: `Le terme "${term}" désigne un universel qui existe indépendamment de tout esprit.`,
        implication: 'L\'essence est objective — une forme idéale ou une essence DB.',
      };

    case ONTOLOGICAL_STANCES.NOMINALISM:
      return {
        term,
        stance,
        status: 'particulier',
        description: `Le terme "${term}" est un nom (flatus vocis) pour un groupe de particuliers.`,
        implication: 'Aucun universel : seule la collection d\'individus existe.',
      };

    case ONTOLOGICAL_STANCES.CONCEPTUALISM:
      return {
        term,
        stance,
        status: 'concept',
        description: `Le terme "${term}" est un concept dans l'esprit d'un agent.`,
        implication: 'L\'universel existe, mais seulement comme contenu mental / classification interne.',
      };
  }
}

/**
 * evaluateStanceCoherence — vérifie qu'un agent ou un système est cohérent
 * avec une stance ontologique donnée.
 *
 * Retourne :
 *  - agentId, stance, coherence (score 0-1), violations (liste de points de friction).
 */
function evaluateStanceCoherence({ agentId, stance, observables = [] }) {
  if (!agentId || !stance) {
    throw new Error('ontologyStances.evaluateStanceCoherence requires agentId and stance');
  }
  if (!Object.values(ONTOLOGICAL_STANCES).includes(stance)) {
    throw new Error(`Invalid stance: ${stance}`);
  }

  const violations = [];
  let coherence = 1.0;

  for (const obs of observables) {
    // Exemple : un "role" défini de façon essentielle (réaliste) mais traité comme étiquette (nominaliste)
    // est une friction potentielle.
    if (stance === ONTOLOGICAL_STANCES.NOMINALISM && obs.signal === 'essential_form') {
      violations.push({
        point: obs.description || 'Essentialisme détecté dans un système nominaliste',
        severity: 'medium',
      });
      coherence -= 0.2;
    }
    if (stance === ONTOLOGICAL_STANCES.CONCEPTUALISM && obs.signal === 'mind_independent_form') {
      violations.push({
        point: obs.description || 'Forme indépendante de l\'esprit dans un système conceptualiste',
        severity: 'low',
      });
      coherence -= 0.1;
    }
    if (stance === ONTOLOGICAL_STANCES.REALISM && obs.signal === 'purely_conceptual') {
      violations.push({
        point: obs.description || 'Concept pur dans un système réaliste',
        severity: 'low',
      });
      coherence -= 0.1;
    }
  }

  coherence = Math.max(0, Math.min(1, coherence));

  return {
    agentId,
    stance,
    coherence: Math.round(coherence * 100) / 100,
    violations,
    verdict:
      coherence >= 0.8
        ? 'coherent'
        : coherence >= 0.5
        ? 'partiel'
        : 'incoherent',
    note:
      stance === ONTOLOGICAL_STANCES.REALISM
        ? 'Réalisme : les universaux sont réels, indépendants de l\'esprit (Platon, Aristote moderé).'
        : stance === ONTOLOGICAL_STANCES.NOMINALISM
        ? 'Nominalisme : seuls les particuliers existent ; les universaux sont des noms (Ockham, Abélard).'
        : 'Conceptualisme : les universaux existent comme concepts dans l\'esprit (Kant, conceptualisme moderne).',
  };
}

/**
 * debateStances — synthèse comparative des trois stances.
 *
 * Retourne un tableau récapitulatif pour documentation ou décision.
 */
function debateStances() {
  return [
    {
      stance: ONTOLOGICAL_STANCES.REALISM,
      question: 'Les universaux ont-ils une existence indépendante de l\'esprit ?',
      answer: 'Oui',
      keyProponents: ['Platon', 'Aristote (moderé)', 'Augustin'],
      genosMapping: 'Formes idéales (platonismService), essences DB (ontologyCore)',
    },
    {
      stance: ONTOLOGICAL_STANCES.NOMINALISM,
      question: 'Les universaux ont-ils une existence indépendante de l\'esprit ?',
      answer: 'Non — seuls les particuliers existent',
      keyProponents: ['Abélard', 'Ockham', 'Hume'],
      genosMapping: 'Tags, labels, étiquettes role sans essence formelle',
    },
    {
      stance: ONTOLOGICAL_STANCES.CONCEPTUALISM,
      question: 'Les universaux ont-ils une existence indépendante de l\'esprit ?',
      answer: 'Seulement comme concepts dans un esprit',
      keyProponents: ['Kant', 'Conceptualisme contemporain'],
      genosMapping: 'Catégories internes, critères de classification, évaluations subjectives',
    },
  ];
}

module.exports = {
  ONTOLOGICAL_STANCES,
  classifyTerm,
  evaluateStanceCoherence,
  debateStances,
};
